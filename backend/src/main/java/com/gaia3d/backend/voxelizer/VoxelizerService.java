package com.gaia3d.backend.voxelizer;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.springframework.stereotype.Service;

import jakarta.annotation.PreDestroy;

@Service
public class VoxelizerService {

    private static final String VOXEL_SET_DIRECTORY_NAME = "VoxelSet";

    private final VoxelizerProperties properties;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String, VoxelizerJob> jobs = new ConcurrentHashMap<>();

    public VoxelizerService(VoxelizerProperties properties) {
        this.properties = properties;
    }

    public VoxelizerJob enqueue(Path sourcePath) {
        Path source = sourcePath.toAbsolutePath().normalize();
        if (!Files.exists(source)) {
            throw new IllegalArgumentException("3D Tiles input does not exist: " + source);
        }
        if (!Files.isDirectory(source) && !isZip(source)) {
            throw new IllegalArgumentException("3D Tiles input must be a directory or zip file: " + source);
        }

        String id = UUID.randomUUID().toString();
        Path preparedTilesPath = resolveJobPath(properties.visualizationTilesPath(), id);
        Path voxelSetPath = resolveJobPath(properties.voxelSetOutputPath(), id).resolve(VOXEL_SET_DIRECTORY_NAME);
        VoxelizerJob job = new VoxelizerJob(
                id,
                VoxelizerJobStatus.PENDING,
                source,
                preparedTilesPath,
                voxelSetPath,
                Instant.now(),
                null,
                null,
                null,
                null);

        jobs.put(id, job);
        executor.execute(() -> run(job));
        return job;
    }

    public Optional<VoxelizerJob> findById(String id) {
        return Optional.ofNullable(jobs.get(id));
    }

    public List<VoxelizerJob> findAll() {
        return jobs.values().stream()
                .sorted(Comparator.comparing(VoxelizerJob::createdAt))
                .toList();
    }

    @PreDestroy
    public void shutdown() {
        executor.shutdownNow();
    }

    private void run(VoxelizerJob job) {
        update(job.id(), VoxelizerJobStatus.RUNNING, Instant.now(), null, null, "Preparing input");

        try {
            validateJarPath();
            prepareInput(job.sourcePath(), job.preparedTilesPath());
            Files.createDirectories(job.voxelSetPath());

            ProcessBuilder processBuilder = new ProcessBuilder(
                    "java",
                    "-jar",
                    properties.jarPath().toAbsolutePath().normalize().toString(),
                    job.preparedTilesPath().toString(),
                    job.voxelSetPath().toString());
            processBuilder.redirectErrorStream(true);

            Process process = processBuilder.start();
            String output;
            try (var reader = process.inputReader()) {
                output = reader.lines().reduce("", (left, right) -> left + System.lineSeparator() + right).trim();
            }
            int exitCode = process.waitFor();

            if (exitCode == 0) {
                update(job.id(), VoxelizerJobStatus.SUCCEEDED, null, Instant.now(), exitCode, output);
            } else {
                update(job.id(), VoxelizerJobStatus.FAILED, null, Instant.now(), exitCode, output);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            update(job.id(), VoxelizerJobStatus.FAILED, null, Instant.now(), null, "Voxelizer job interrupted");
        } catch (Exception exception) {
            update(job.id(), VoxelizerJobStatus.FAILED, null, Instant.now(), null, exception.getMessage());
        }
    }

    private void validateJarPath() {
        Path jarPath = properties.jarPath().toAbsolutePath().normalize();
        if (!Files.isRegularFile(jarPath)) {
            throw new IllegalStateException("Voxelizer jar does not exist: " + jarPath);
        }
    }

    private void prepareInput(Path sourcePath, Path preparedTilesPath) throws IOException {
        Files.createDirectories(resolveJobPath(properties.tempPath(), preparedTilesPath.getFileName().toString()));
        Files.createDirectories(preparedTilesPath);

        if (Files.isDirectory(sourcePath)) {
            copyDirectory(sourcePath, preparedTilesPath);
            return;
        }

        extractZip(sourcePath, preparedTilesPath);
    }

    private void copyDirectory(Path sourcePath, Path targetPath) throws IOException {
        try (Stream<Path> paths = Files.walk(sourcePath)) {
            paths.forEach(path -> {
                try {
                    Path target = targetPath.resolve(sourcePath.relativize(path)).normalize();
                    if (Files.isDirectory(path)) {
                        Files.createDirectories(target);
                    } else {
                        Files.createDirectories(target.getParent());
                        Files.copy(path, target, StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException exception) {
                    throw new UncheckedIOException(exception);
                }
            });
        } catch (UncheckedIOException exception) {
            throw exception.getCause();
        }
    }

    private void extractZip(Path zipPath, Path targetPath) throws IOException {
        try (ZipInputStream zipInputStream = new ZipInputStream(Files.newInputStream(zipPath))) {
            ZipEntry entry;
            while ((entry = zipInputStream.getNextEntry()) != null) {
                Path target = targetPath.resolve(entry.getName()).normalize();
                if (!target.startsWith(targetPath)) {
                    throw new IOException("Zip entry escapes target directory: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    Files.createDirectories(target);
                } else {
                    Files.createDirectories(target.getParent());
                    Files.copy(zipInputStream, target, StandardCopyOption.REPLACE_EXISTING);
                }
                zipInputStream.closeEntry();
            }
        }
    }

    private void update(
            String id,
            VoxelizerJobStatus status,
            Instant startedAt,
            Instant finishedAt,
            Integer exitCode,
            String message) {
        jobs.computeIfPresent(id, (key, current) -> new VoxelizerJob(
                current.id(),
                status,
                current.sourcePath(),
                current.preparedTilesPath(),
                current.voxelSetPath(),
                current.createdAt(),
                startedAt == null ? current.startedAt() : startedAt,
                finishedAt == null ? current.finishedAt() : finishedAt,
                exitCode,
                message));
    }

    private Path resolveJobPath(Path rootPath, String id) {
        return rootPath.toAbsolutePath().normalize().resolve(id).normalize();
    }

    private boolean isZip(Path path) {
        return path.getFileName().toString().toLowerCase().endsWith(".zip");
    }
}
