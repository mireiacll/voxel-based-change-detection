package com.gaia3d.backend.common;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;

import com.gaia3d.backend.diff.Diff;
import com.gaia3d.backend.diff.DiffItemRepository;
import com.gaia3d.backend.diff.DiffRepository;
import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobRepository;
import com.gaia3d.backend.job.JobService;
import com.gaia3d.backend.job.JobStatus;
import com.gaia3d.backend.job.JobTargetType;
import com.gaia3d.backend.observation.Observation;
import com.gaia3d.backend.observation.ObservationRepository;
import com.gaia3d.backend.voxelizer.VoxelizerProperties;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CascadeDeletionService {

    private final DiffRepository diffRepository;
    private final DiffItemRepository diffItemRepository;
    private final ObservationRepository observationRepository;
    private final JobRepository jobRepository;
    private final JobService jobService;
    private final VoxelizerProperties properties;

    public CascadeDeletionService(
            DiffRepository diffRepository,
            DiffItemRepository diffItemRepository,
            ObservationRepository observationRepository,
            JobRepository jobRepository,
            JobService jobService,
            VoxelizerProperties properties) {
        this.diffRepository = diffRepository;
        this.diffItemRepository = diffItemRepository;
        this.observationRepository = observationRepository;
        this.jobRepository = jobRepository;
        this.jobService = jobService;
        this.properties = properties;
    }

    @Transactional
    public void deleteProjectContents(Long projectId) {
        for (Diff diff : diffRepository.findByProjectIdOrderByCreatedAtDesc(projectId)) {
            deleteDiff(diff);
        }
        for (Observation observation : observationRepository.findByProjectIdOrderByObservedAtAsc(projectId)) {
            deleteObservation(observation);
        }
        deleteDirectoryIfEmpty(projectVisualizationDir(projectId));
        deleteDirectoryIfEmpty(projectVoxelDir(projectId));
    }

    @Transactional
    public void deleteDiff(Diff diff) {
        List<Job> jobs = jobRepository.findByTargetTypeAndTargetIdOrderByCreatedAtAscIdAsc(JobTargetType.DIFF, diff.getId());
        cancelJobs(jobs);
        diffItemRepository.deleteByDiffId(diff.getId());
        diffRepository.delete(diff);
        deleteJobs(jobs);
        deleteDirectoryQuietly(diffDir(diff.getProjectId(), diff.getId()));
        deleteDirectoryIfEmpty(projectVoxelDir(diff.getProjectId()).resolve("diffs"));
    }

    @Transactional
    public void deleteObservation(Observation observation) {
        List<Job> jobs = jobRepository.findByTargetTypeAndTargetIdOrderByCreatedAtAscIdAsc(
                JobTargetType.OBSERVATION,
                observation.getId());
        cancelJobs(jobs);
        observationRepository.delete(observation);
        deleteJobs(jobs);
        deleteDirectoryQuietly(observationTilesetDir(observation.getProjectId(), observation.getId()));
        deleteDirectoryQuietly(observationVoxelDir(observation.getProjectId(), observation.getId()));
        deleteDirectoryIfEmpty(projectVisualizationDir(observation.getProjectId()).resolve("observations"));
        deleteDirectoryIfEmpty(projectVoxelDir(observation.getProjectId()).resolve("observations"));
    }

    private void cancelJobs(List<Job> jobs) {
        for (Job job : jobs) {
            if (job.getStatus() == JobStatus.QUEUED || job.getStatus() == JobStatus.RUNNING) {
                jobService.cancel(job.getId());
            }
        }
    }

    private void deleteJobs(List<Job> jobs) {
        for (Job job : jobs) {
            jobRepository.findById(job.getId()).ifPresent(jobRepository::delete);
        }
    }

    private Path observationTilesetDir(Long projectId, Long observationId) {
        return projectVisualizationDir(projectId)
                .resolve("observations")
                .resolve(observationId.toString())
                .resolve("tileset")
                .toAbsolutePath()
                .normalize();
    }

    private Path observationVoxelDir(Long projectId, Long observationId) {
        return projectVoxelDir(projectId)
                .resolve("observations")
                .resolve(observationId.toString())
                .resolve("voxel")
                .toAbsolutePath()
                .normalize();
    }

    private Path diffDir(Long projectId, Long diffId) {
        return projectVoxelDir(projectId)
                .resolve("diffs")
                .resolve(diffId.toString())
                .toAbsolutePath()
                .normalize();
    }

    private Path projectVisualizationDir(Long projectId) {
        return properties.visualizationTilesPath()
                .resolve("projects")
                .resolve(projectId.toString())
                .toAbsolutePath()
                .normalize();
    }

    private Path projectVoxelDir(Long projectId) {
        return properties.voxelSetOutputPath()
                .resolve("projects")
                .resolve(projectId.toString())
                .toAbsolutePath()
                .normalize();
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

    private void deleteDirectoryIfEmpty(Path directory) {
        try {
            if (!Files.isDirectory(directory)) {
                return;
            }
            try (var paths = Files.list(directory)) {
                if (paths.findAny().isEmpty()) {
                    Files.deleteIfExists(directory);
                }
            }
        } catch (IOException ignored) {
            // Best-effort cleanup only.
        }
    }
}
