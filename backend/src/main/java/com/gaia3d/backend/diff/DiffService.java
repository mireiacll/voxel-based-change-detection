package com.gaia3d.backend.diff;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

import com.gaia3d.backend.common.TilesetUrlResponse;
import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobService;
import com.gaia3d.backend.job.JobTargetType;
import com.gaia3d.backend.job.JobType;
import com.gaia3d.backend.observation.Observation;
import com.gaia3d.backend.observation.ObservationRepository;
import com.gaia3d.backend.observation.ObservationStatus;
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
import org.springframework.web.server.ResponseStatusException;

@Service
public class DiffService {

    private static final Logger log = LoggerFactory.getLogger(DiffService.class);
    private static final String DIFF_OPERATION = "ADD_AND_REMOVE";

    private final DiffRepository diffRepository;
    private final DiffItemRepository diffItemRepository;
    private final ObservationRepository observationRepository;
    private final ProjectService projectService;
    private final JobService jobService;
    private final VoxelizerCommandService commandService;
    private final VoxelizerProcessService processService;
    private final VoxelizerProperties properties;

    public DiffService(
            DiffRepository diffRepository,
            DiffItemRepository diffItemRepository,
            ObservationRepository observationRepository,
            ProjectService projectService,
            JobService jobService,
            VoxelizerCommandService commandService,
            VoxelizerProcessService processService,
            VoxelizerProperties properties) {
        this.diffRepository = diffRepository;
        this.diffItemRepository = diffItemRepository;
        this.observationRepository = observationRepository;
        this.projectService = projectService;
        this.jobService = jobService;
        this.commandService = commandService;
        this.processService = processService;
        this.properties = properties;
    }

    public List<DiffListResponse> findByProject(Long projectId, DiffType type, DiffStatus status) {
        projectService.getRequired(projectId);
        return diffRepository.findByProjectIdOrderByCreatedAtDesc(projectId).stream()
                .filter(diff -> type == null || diff.getType() == type)
                .filter(diff -> status == null || diff.getStatus() == status)
                .map(diff -> DiffListResponse.from(diff, diffItemRepository.countByDiffId(diff.getId())))
                .toList();
    }

    @Transactional
    public DiffCreateResponse createAb(Long projectId, CreateAbDiffRequest request) {
        projectService.getRequired(projectId);
        Observation source = getObservation(request.sourceObservationId());
        Observation target = getObservation(request.targetObservationId());
        validateComparable(projectId, source, target);
        if (!source.getObservedAt().isBefore(target.getObservedAt())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sourceObservationId must be older than targetObservationId");
        }

        Diff diff = diffRepository.save(new Diff(projectId, request.name(), DiffType.A_B, options(request)));
        DiffItem item = diffItemRepository.save(new DiffItem(
                diff.getId(),
                projectId,
                source.getId(),
                target.getId(),
                source.getObservedAt(),
                target.getObservedAt(),
                source.getVoxelPath(),
                target.getVoxelPath()));
        prepareItem(diff, item);
        Job job = createDiffJob(diff);
        diff.attachJob(job.getId());
        runMock(diff, job);
        return DiffCreateResponse.from(diffRepository.save(diff), 1);
    }

    @Transactional
    public DiffCreateResponse createTimeSeries(Long projectId, CreateTimeSeriesDiffRequest request) {
        projectService.getRequired(projectId);
        List<Observation> observations = observationRepository.findByProjectIdOrderByObservedAtAsc(projectId).stream()
                .filter(observation -> observation.getVoxelStatus() == ObservationStatus.SUCCEEDED)
                .toList();
        if (observations.size() < 2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "at least two succeeded observations are required");
        }

        Diff diff = diffRepository.save(new Diff(projectId, request.name(), DiffType.TIME_SERIES, options(request)));
        for (int i = 0; i < observations.size() - 1; i++) {
            Observation source = observations.get(i);
            Observation target = observations.get(i + 1);
            DiffItem item = diffItemRepository.save(new DiffItem(
                    diff.getId(),
                    projectId,
                    source.getId(),
                    target.getId(),
                    source.getObservedAt(),
                    target.getObservedAt(),
                    source.getVoxelPath(),
                    target.getVoxelPath()));
            prepareItem(diff, item);
        }
        Job job = createDiffJob(diff);
        diff.attachJob(job.getId());
        runMock(diff, job);
        return DiffCreateResponse.from(diffRepository.save(diff), observations.size() - 1L);
    }

    public DiffDetailResponse findById(Long diffId) {
        Diff diff = getDiff(diffId);
        return DiffDetailResponse.from(diff, diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diffId));
    }

    @Transactional
    public void delete(Long diffId) {
        Diff diff = getDiff(diffId);
        diffItemRepository.deleteByDiffId(diffId);
        diffRepository.delete(diff);
        deleteDirectoryQuietly(diffDir(diff.getProjectId(), diffId));
    }

    @Transactional
    public DiffDetailResponse cancel(Long diffId) {
        Diff diff = getDiff(diffId);
        if (diff.getStatus() == DiffStatus.SUCCEEDED || diff.getStatus() == DiffStatus.FAILED
                || diff.getStatus() == DiffStatus.PARTIAL_FAILED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "completed diff cannot be cancelled");
        }
        diff.finish(DiffStatus.CANCELLED);
        diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diffId).forEach(DiffItem::cancel);
        if (diff.getJobId() != null) {
            jobService.cancel(diff.getJobId());
        }
        return findById(diffId);
    }

    public List<DiffItemResponse> findItems(Long diffId) {
        getDiff(diffId);
        return diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diffId).stream()
                .map(DiffItemResponse::from)
                .toList();
    }

    public DiffItemResponse findItem(Long diffItemId) {
        return DiffItemResponse.from(getItem(diffItemId));
    }

    public TilesetUrlResponse itemTileset(Long diffItemId) {
        return new TilesetUrlResponse(getItem(diffItemId).getResultTilesetUrl());
    }

    public DiffItemReportResponse itemReport(Long diffItemId) {
        return DiffItemReportResponse.from(getItem(diffItemId));
    }

    private Observation getObservation(Long id) {
        return observationRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "observation not found: " + id));
    }

    private Diff getDiff(Long id) {
        return diffRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "diff not found: " + id));
    }

    private DiffItem getItem(Long id) {
        return diffItemRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "diff item not found: " + id));
    }

    private void validateComparable(Long projectId, Observation source, Observation target) {
        if (!source.getProjectId().equals(projectId) || !target.getProjectId().equals(projectId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "observations must belong to the project");
        }
        if (source.getVoxelStatus() != ObservationStatus.SUCCEEDED || target.getVoxelStatus() != ObservationStatus.SUCCEEDED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "source and target voxel status must be SUCCEEDED");
        }
    }

    private DiffOptions options(CreateAbDiffRequest request) {
        VoxelizerProperties.DefaultDiff defaults = properties.defaultDiff();
        return new DiffOptions(
                request.maxLevel() == null ? defaults.maxLevel() : request.maxLevel(),
                request.visualize() == null ? defaults.visualize() : request.visualize(),
                null,
                request.interiorOnly() == null ? defaults.interiorOnly() : request.interiorOnly(),
                request.massSummary() == null ? defaults.massSummary() : request.massSummary(),
                request.cubeDataType() == null ? defaults.cubeDataType() : request.cubeDataType(),
                request.recursive() == null ? defaults.recursive() : request.recursive(),
                request.filterThreshold(),
                request.areaWkt());
    }

    private DiffOptions options(CreateTimeSeriesDiffRequest request) {
        VoxelizerProperties.DefaultDiff defaults = properties.defaultDiff();
        return new DiffOptions(
                request.maxLevel() == null ? defaults.maxLevel() : request.maxLevel(),
                request.visualize() == null ? defaults.visualize() : request.visualize(),
                null,
                request.interiorOnly() == null ? defaults.interiorOnly() : request.interiorOnly(),
                request.massSummary() == null ? defaults.massSummary() : request.massSummary(),
                request.cubeDataType() == null ? defaults.cubeDataType() : request.cubeDataType(),
                request.recursive() == null ? defaults.recursive() : request.recursive(),
                request.filterThreshold(),
                request.areaWkt());
    }

    private void prepareItem(Diff diff, DiffItem item) {
        Path output = diffItemVoxelDir(diff.getProjectId(), diff.getId(), item.getId());
        Path summary = diffItemDir(diff.getProjectId(), diff.getId(), item.getId()).resolve("summary.json");
        var commandArgs = commandService.createDiffCommandArgs(
                Path.of(item.getSourceVoxelPath()),
                Path.of(item.getTargetVoxelPath()),
                output,
                diff.getMaxLevel(),
                DIFF_OPERATION,
                diff.getVisualize(),
                diff.getInteriorOnly(),
                diff.getMassSummary(),
                diff.getCubeDataType(),
                diff.getRecursive());
        String command = commandService.toDisplayCommand(commandArgs);
        // TODO: Connect filterThreshold and areaWkt when voxelizer exposes matching CLI options.
        item.prepareResult(
                output.toString(),
                tilesetUrl(output),
                summary.toString(),
                command,
                diffItemDir(diff.getProjectId(), diff.getId(), item.getId()).resolve("process.log").toString());
        diffItemRepository.save(item);
    }

    private Job createDiffJob(Diff diff) {
        String command = diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diff.getId()).stream()
                .map(DiffItem::getCommand)
                .findFirst()
                .orElse("diff job has no items");
        return jobService.create(
                JobType.DIFF_CREATE,
                JobTargetType.DIFF,
                diff.getId(),
                command,
                properties.storageRoot().resolve("jobs").resolve("diff-" + diff.getId()).resolve("process.log").toString());
    }

    private void runMock(Diff diff, Job job) {
        diff.start();
        job.start("Creating diff voxel...");
        List<DiffItem> items = diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diff.getId());
        int succeeded = 0;
        for (DiffItem item : items) {
            item.start();
            try {
                Files.createDirectories(Path.of(item.getResultVoxelPath()));
                if (properties.mockExecution()) {
                    log.info("[diff:{} item:{}] mock voxelizer diff: {}", diff.getId(), item.getId(), item.getCommand());
                    item.succeed();
                    succeeded++;
                } else {
                    log.info("[diff:{} item:{}] running voxelizer diff", diff.getId(), item.getId());
                    List<String> commandArgs = commandService.createDiffCommandArgs(
                            Path.of(item.getSourceVoxelPath()),
                            Path.of(item.getTargetVoxelPath()),
                            Path.of(item.getResultVoxelPath()),
                            diff.getMaxLevel(),
                            DIFF_OPERATION,
                            diff.getVisualize(),
                            diff.getInteriorOnly(),
                            diff.getMassSummary(),
                            diff.getCubeDataType(),
                            diff.getRecursive());
                    VoxelizerProcessResult result = processService.run(commandArgs, Path.of(item.getLogPath()));
                    if (result.succeeded()) {
                        item.succeed();
                        succeeded++;
                    } else {
                        log.warn("[diff:{} item:{}] voxelizer diff failed exitCode={}",
                                diff.getId(),
                                item.getId(),
                                result.exitCode());
                        item.fail();
                    }
                }
            } catch (IOException | InterruptedException exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                log.warn("[diff:{} item:{}] voxelizer diff failed", diff.getId(), item.getId(), exception);
                item.fail();
            }
            diffItemRepository.save(item);
        }
        if (succeeded == items.size()) {
            diff.finish(DiffStatus.SUCCEEDED);
            job.succeed("Mock diff creation completed");
        } else if (succeeded == 0) {
            diff.finish(DiffStatus.FAILED);
            job.fail("All diff items failed");
        } else {
            diff.finish(DiffStatus.PARTIAL_FAILED);
            job.fail("Some diff items failed");
        }
        jobService.save(job);
    }

    private Path diffDir(Long projectId, Long diffId) {
        return properties.voxelSetOutputPath().resolve("projects").resolve(projectId.toString())
                .resolve("diffs").resolve(diffId.toString()).toAbsolutePath().normalize();
    }

    private Path diffItemDir(Long projectId, Long diffId, Long itemId) {
        return diffDir(projectId, diffId).resolve("items").resolve(itemId.toString()).toAbsolutePath().normalize();
    }

    private Path diffItemVoxelDir(Long projectId, Long diffId, Long itemId) {
        return diffItemDir(projectId, diffId, itemId).resolve("voxel").toAbsolutePath().normalize();
    }

    private String tilesetUrl(Path directory) {
        return directory.resolve("tileset.json").toString().replace('\\', '/');
    }

    private void deleteDirectoryQuietly(Path directory) {
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
        } catch (IOException | UncheckedIOException ignored) {
            // Best-effort cleanup only.
        }
    }
}
