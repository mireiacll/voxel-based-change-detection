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

import com.gaia3d.backend.common.CascadeDeletionService;
import com.gaia3d.backend.common.TilesetUrlResolver;
import com.gaia3d.backend.common.TilesetUrlResponse;
import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobQueue;
import com.gaia3d.backend.job.JobService;
import com.gaia3d.backend.job.JobTargetType;
import com.gaia3d.backend.job.JobType;
import com.gaia3d.backend.project.ProjectService;
import com.gaia3d.backend.voxelizer.VoxelizerCommandService;
import com.gaia3d.backend.voxelizer.VoxelizerProperties;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ObservationService {

    private final ObservationRepository observationRepository;
    private final ProjectService projectService;
    private final JobService jobService;
    private final VoxelizerCommandService commandService;
    private final VoxelizerProperties properties;
    private final TilesetUrlResolver tilesetUrlResolver;
    private final JobQueue jobQueue;
    private final ObservationVoxelJobRunner observationVoxelJobRunner;
    private final CascadeDeletionService cascadeDeletionService;

    public ObservationService(
            ObservationRepository observationRepository,
            ProjectService projectService,
            JobService jobService,
            VoxelizerCommandService commandService,
            VoxelizerProperties properties,
            TilesetUrlResolver tilesetUrlResolver,
            JobQueue jobQueue,
            ObservationVoxelJobRunner observationVoxelJobRunner,
            CascadeDeletionService cascadeDeletionService) {
        this.observationRepository = observationRepository;
        this.projectService = projectService;
        this.jobService = jobService;
        this.commandService = commandService;
        this.properties = properties;
        this.tilesetUrlResolver = tilesetUrlResolver;
        this.jobQueue = jobQueue;
        this.observationVoxelJobRunner = observationVoxelJobRunner;
        this.cascadeDeletionService = cascadeDeletionService;
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
    public ObservationResponse upload(Long projectId, String name, LocalDate observedAt,
            ObservationDatasetType datasetType, MultipartFile file) {
        projectService.getRequired(projectId);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file is required");
        }
        if (datasetType == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "datasetType is required");
        }
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || !originalFilename.toLowerCase().endsWith(".zip")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file must be a zip");
        }

        Observation observation = observationRepository.save(new Observation(projectId, name, observedAt, datasetType));
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

        observation.setOriginalTiles(tilesetDir.toString(), tilesetUrlResolver.visualizationTilesetUrl(tilesetDir));
        observationRepository.save(observation);
        return queueVoxelize(observation, new VoxelizeRequest(null, null, null, null, null));
    }

    @Transactional
    public ObservationResponse update(Long id, ObservationUpdateRequest request) {
        Observation observation = getRequired(id);
        observation.update(request.name(), request.observedAt());
        return ObservationResponse.from(observationRepository.save(observation));
    }

    @Transactional
    public void delete(Long id) {
        cascadeDeletionService.deleteObservation(getRequired(id));
    }

    public TilesetUrlResponse originalTileset(Long id) {
        return new TilesetUrlResponse(getRequired(id).getOriginalTilesetUrl());
    }

    public TilesetUrlResponse voxelTileset(Long id) {
        return new TilesetUrlResponse(getRequired(id).getVoxelTilesetUrl());
    }

    public ObservationVoxelStatusResponse voxelStatus(Long id) {
        Observation observation = getRequired(id);
        Job job = observation.getVoxelJobId() == null ? null : jobService.getRequired(observation.getVoxelJobId());
        return ObservationVoxelStatusResponse.from(observation, job);
    }

    @Transactional
    public ObservationVoxelStatusResponse cancelVoxel(Long id) {
        Observation observation = getRequired(id);
        if (observation.getVoxelJobId() != null) {
            jobService.cancel(observation.getVoxelJobId());
        } else {
            observation.cancelVoxel();
            observationRepository.save(observation);
        }
        Observation updated = getRequired(id);
        Job job = updated.getVoxelJobId() == null ? null : jobService.getRequired(updated.getVoxelJobId());
        return ObservationVoxelStatusResponse.from(updated, job);
    }

    @Transactional
    public ObservationResponse voxelize(Long observationId, VoxelizeRequest request) {
        Observation observation = getRequired(observationId);
        return queueVoxelize(observation, request);
    }

    private ObservationResponse queueVoxelize(Observation observation, VoxelizeRequest request) {
        if (observation.getVoxelStatus() == ObservationStatus.QUEUED
                || observation.getVoxelStatus() == ObservationStatus.RUNNING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "voxel job is already queued or running");
        }

        VoxelizeRequest safeRequest = request == null ? new VoxelizeRequest(null, null, null, null, null) : request;
        VoxelizerProperties.DefaultCreate defaults = properties.defaultCreate();
        int maxLevel = safeRequest.maxLevel() == null ? defaults.maxLevel() : safeRequest.maxLevel();
        boolean visualize = safeRequest.visualize() == null ? defaults.visualize() : safeRequest.visualize();
        String visualizeColor = safeRequest.visualizeColor() == null ? defaults.visualizeColor() : safeRequest.visualizeColor();
        String cubeDataType = safeRequest.cubeDataType() == null ? defaults.cubeDataType() : safeRequest.cubeDataType();
        boolean recursive = safeRequest.recursive() == null ? defaults.recursive() : safeRequest.recursive();

        Path tilesetDir = Path.of(observation.getOriginalTilesPath());
        Path voxelDir = observationVoxelDir(observation.getProjectId(), observation.getId());
        Path logPath = voxelDir.resolve("log.txt").toAbsolutePath().normalize();
        var commandArgs = commandService.createVoxelCommandArgs(
                tilesetDir,
                voxelDir,
                logPath,
                maxLevel,
                visualize,
                visualizeColor,
                cubeDataType,
                defaults.regionGpkgPath(),
                defaults.invertRegionFilter(),
                recursive);
        String command = commandService.toDisplayCommand(commandArgs);
        Job job = jobService.create(
                JobType.VOXEL_CREATE,
                JobTargetType.OBSERVATION,
                observation.getId(),
                command,
                logPath.toString());
        observation.queueVoxel(job.getId(), voxelDir.toString());
        Observation savedObservation = observationRepository.save(observation);
        jobQueue.enqueue(job.getId(), () -> observationVoxelJobRunner.run(savedObservation.getId(), safeRequest));
        return ObservationResponse.from(savedObservation);
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
