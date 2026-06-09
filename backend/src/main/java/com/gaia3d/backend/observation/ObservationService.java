package com.gaia3d.backend.observation;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import com.gaia3d.backend.common.TilesetUrlResponse;
import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobService;
import com.gaia3d.backend.job.JobTargetType;
import com.gaia3d.backend.job.JobType;
import com.gaia3d.backend.project.ProjectService;
import com.gaia3d.backend.voxelizer.VoxelizerCommandService;
import com.gaia3d.backend.voxelizer.VoxelizerProcessService;
import com.gaia3d.backend.voxelizer.VoxelizerProcessService.VoxelizerProcessResult;
import com.gaia3d.backend.voxelizer.VoxelizerProperties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ObservationService {

    private static final Logger log = LoggerFactory.getLogger(ObservationService.class);

    private final ObservationRepository observationRepository;
    private final ProjectService projectService;
    private final JobService jobService;
    private final VoxelizerCommandService commandService;
    private final VoxelizerProcessService processService;
    private final VoxelizerProperties properties;

    public ObservationService(
            ObservationRepository observationRepository,
            ProjectService projectService,
            JobService jobService,
            VoxelizerCommandService commandService,
            VoxelizerProcessService processService,
            VoxelizerProperties properties) {
        this.observationRepository = observationRepository;
        this.projectService = projectService;
        this.jobService = jobService;
        this.commandService = commandService;
        this.processService = processService;
        this.properties = properties;
    }

    public List<ObservationResponse> findByProject(Long projectId) {
        projectService.getRequired(projectId);
        return observationRepository.findByProjectIdOrderByObservedAtAsc(projectId).stream()
                .map(ObservationResponse::from)
                .toList();
    }

    public Observation getRequired(Long id) {
        return observationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "observation not found: " + id));
    }

    public ObservationResponse findById(Long id) {
        return ObservationResponse.from(getRequired(id));
    }

    @Transactional
    public ObservationResponse upload(Long projectId, String name, LocalDate observedAt, MultipartFile file) {
        projectService.getRequired(projectId);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file is required");
        }
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".zip")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file must be a zip");
        }

        Observation observation = observationRepository.save(new Observation(projectId, name, observedAt));
        Path tilesetDir = observationTilesetDir(projectId, observation.getId());
        Path voxelDir = observationVoxelDir(projectId, observation.getId());
        try {
            deleteDirectoryIfExists(tilesetDir);
            Files.createDirectories(tilesetDir);
            extractZip(file, tilesetDir);
            if (!Files.isRegularFile(tilesetDir.resolve("tileset.json"))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "tileset.json not found in uploaded zip root");
            }
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }

        observation.setOriginalTiles(tilesetDir.toString(), tilesetUrl(tilesetDir));
        observationRepository.save(observation);
        return voxelize(observation.getId(), new VoxelizeRequest(null, null, null, null, null));
    }

    @Transactional
    public ObservationResponse update(Long id, ObservationUpdateRequest request) {
        Observation observation = getRequired(id);
        observation.update(request.name(), request.observedAt());
        return ObservationResponse.from(observationRepository.save(observation));
    }

    @Transactional
    public void delete(Long id) {
        observationRepository.delete(getRequired(id));
    }

    public TilesetUrlResponse originalTileset(Long id) {
        return new TilesetUrlResponse(getRequired(id).getOriginalTilesetUrl());
    }

    public TilesetUrlResponse voxelTileset(Long id) {
        return new TilesetUrlResponse(getRequired(id).getVoxelTilesetUrl());
    }

    @Transactional
    public ObservationResponse voxelize(Long observationId, VoxelizeRequest request) {
        Observation observation = getRequired(observationId);
        VoxelizerProperties.DefaultCreate defaults = properties.defaultCreate();
        int maxLevel = request.maxLevel() == null ? defaults.maxLevel() : request.maxLevel();
        boolean visualize = request.visualize() == null ? defaults.visualize() : request.visualize();
        String visualizeColor = request.visualizeColor() == null ? defaults.visualizeColor() : request.visualizeColor();
        String cubeDataType = request.cubeDataType() == null ? defaults.cubeDataType() : request.cubeDataType();
        boolean recursive = request.recursive() == null ? defaults.recursive() : request.recursive();

        Path tilesetDir = Path.of(observation.getOriginalTilesPath());
        Path voxelDir = observationVoxelDir(observation.getProjectId(), observation.getId());
        var commandArgs = commandService.createVoxelCommandArgs(
                tilesetDir,
                voxelDir,
                maxLevel,
                visualize,
                visualizeColor,
                cubeDataType,
                recursive);
        String command = commandService.toDisplayCommand(commandArgs);
        Path logPath = jobLogPath(observation.getId());
        Job job = jobService.create(
                JobType.VOXEL_CREATE,
                JobTargetType.OBSERVATION,
                observation.getId(),
                command,
                logPath.toString());
        observation.queueVoxel(job.getId(), voxelDir.toString());
        observation.startVoxel();
        job.start("Creating voxel...");
        try {
            Files.createDirectories(voxelDir);
            if (properties.mockExecution()) {
                log.info("[observation:{}] mock voxelizer create: {}", observation.getId(), command);
                observation.succeedVoxel(tilesetUrl(voxelDir));
                job.succeed("Mock voxel creation completed");
            } else {
                log.info("[observation:{}] running voxelizer create", observation.getId());
                VoxelizerProcessResult result = processService.run(commandArgs, logPath);
                if (result.succeeded()) {
                    observation.succeedVoxel(tilesetUrl(voxelDir));
                    job.succeed("Voxel creation completed. exitCode=" + result.exitCode());
                } else {
                    observation.failVoxel();
                    job.fail("Voxel creation failed. exitCode=" + result.exitCode());
                }
            }
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("[observation:{}] voxelizer create failed", observation.getId(), exception);
            observation.failVoxel();
            job.fail(exception.getMessage());
        }
        jobService.save(job);
        return ObservationResponse.from(observationRepository.save(observation));
    }

    private void extractZip(MultipartFile file, Path targetDir) throws IOException {
        try (ZipInputStream zipInputStream = new ZipInputStream(file.getInputStream())) {
            ZipEntry entry;
            while ((entry = zipInputStream.getNextEntry()) != null) {
                Path target = targetDir.resolve(entry.getName()).normalize();
                if (!target.startsWith(targetDir)) {
                    throw new IOException("zip entry escapes target directory: " + entry.getName());
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

    private Path observationTilesetDir(Long projectId, Long observationId) {
        return properties.visualizationTilesPath().resolve("projects").resolve(projectId.toString())
                .resolve("observations").resolve(observationId.toString()).resolve("tileset")
                .toAbsolutePath().normalize();
    }

    private Path observationVoxelDir(Long projectId, Long observationId) {
        return properties.voxelSetOutputPath().resolve("projects").resolve(projectId.toString())
                .resolve("observations").resolve(observationId.toString()).resolve("voxel")
                .toAbsolutePath().normalize();
    }

    private Path jobLogPath(Long id) {
        return properties.storageRoot().resolve("jobs").resolve(id.toString()).resolve("process.log")
                .toAbsolutePath().normalize();
    }

    private String tilesetUrl(Path directory) {
        return directory.resolve("tileset.json").toString().replace('\\', '/');
    }

    private void deleteDirectoryIfExists(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (var paths = Files.walk(directory)) {
            paths.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                } catch (IOException exception) {
                    throw new UncheckedIOException(exception);
                }
            });
        } catch (UncheckedIOException exception) {
            throw exception.getCause();
        }
    }
}
