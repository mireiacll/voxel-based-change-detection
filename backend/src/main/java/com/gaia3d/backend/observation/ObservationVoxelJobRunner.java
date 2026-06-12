package com.gaia3d.backend.observation;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.gaia3d.backend.common.TilesetUrlResolver;
import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobService;
import com.gaia3d.backend.job.JobStatus;
import com.gaia3d.backend.voxelizer.VoxelizerCommandService;
import com.gaia3d.backend.voxelizer.VoxelizerProcessService;
import com.gaia3d.backend.voxelizer.VoxelizerProcessService.VoxelizerProcessResult;
import com.gaia3d.backend.voxelizer.VoxelizerProperties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ObservationVoxelJobRunner {

    private static final Logger log = LoggerFactory.getLogger(ObservationVoxelJobRunner.class);

    private final ObservationRepository observationRepository;
    private final JobService jobService;
    private final VoxelizerCommandService commandService;
    private final VoxelizerProcessService processService;
    private final VoxelizerProperties properties;
    private final TilesetUrlResolver tilesetUrlResolver;

    public ObservationVoxelJobRunner(
            ObservationRepository observationRepository,
            JobService jobService,
            VoxelizerCommandService commandService,
            VoxelizerProcessService processService,
            VoxelizerProperties properties,
            TilesetUrlResolver tilesetUrlResolver) {
        this.observationRepository = observationRepository;
        this.jobService = jobService;
        this.commandService = commandService;
        this.processService = processService;
        this.properties = properties;
        this.tilesetUrlResolver = tilesetUrlResolver;
    }

    public void run(Long observationId, VoxelizeRequest request) {
        ObservationVoxelExecution execution = begin(observationId, request);
        if (execution == null) {
            return;
        }

        try {
            Files.createDirectories(execution.voxelDir());
            if (properties.mockExecution()) {
                log.info("[observation:{}] mock queued voxelizer create: {}", observationId, execution.command());
                markSucceeded(
                        execution.observationId(),
                        execution.jobId(),
                        tilesetUrlResolver.voxelTilesetUrl(execution.voxelDir()),
                        "Mock voxel creation completed");
                return;
            }

            log.info("[observation:{}] running queued voxelizer create", observationId);
            VoxelizerProcessResult result = processService.run(execution.commandArgs(), execution.logPath());
            if (result.succeeded()) {
                markSucceeded(
                        execution.observationId(),
                        execution.jobId(),
                        tilesetUrlResolver.voxelTilesetUrl(execution.voxelDir()),
                        "Voxel creation completed. exitCode=" + result.exitCode());
            } else {
                markFailed(execution.observationId(), execution.jobId(),
                        "Voxel creation failed. exitCode=" + result.exitCode());
            }
        } catch (IOException | InterruptedException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("[observation:{}] queued voxelizer create failed", observationId, exception);
            markFailed(execution.observationId(), execution.jobId(), exception.getMessage());
        }
    }

    @Transactional
    protected ObservationVoxelExecution begin(Long observationId, VoxelizeRequest request) {
        Observation observation = observationRepository.findById(observationId).orElse(null);
        if (observation == null || observation.getVoxelJobId() == null) {
            return null;
        }

        Job job = jobService.getRequired(observation.getVoxelJobId());
        if (job.getStatus() == JobStatus.CANCELLED || observation.getVoxelStatus() == ObservationStatus.CANCELLED) {
            return null;
        }
        if (job.getStatus() != JobStatus.QUEUED || observation.getVoxelStatus() != ObservationStatus.QUEUED) {
            return null;
        }

        VoxelizerProperties.DefaultCreate defaults = properties.defaultCreate();
        int maxLevel = request.maxLevel() == null ? defaults.maxLevel() : request.maxLevel();
        boolean visualize = request.visualize() == null ? defaults.visualize() : request.visualize();
        String visualizeColor = request.visualizeColor() == null ? defaults.visualizeColor() : request.visualizeColor();
        String cubeDataType = request.cubeDataType() == null ? defaults.cubeDataType() : request.cubeDataType();
        boolean recursive = request.recursive() == null ? defaults.recursive() : request.recursive();

        Path tilesetDir = Path.of(observation.getOriginalTilesPath());
        Path voxelDir = Path.of(observation.getVoxelPath());
        Path logPath = Path.of(job.getLogPath());
        List<String> commandArgs = commandService.createVoxelCommandArgs(
                tilesetDir,
                voxelDir,
                maxLevel,
                visualize,
                visualizeColor,
                cubeDataType,
                recursive);
        String command = commandService.toDisplayCommand(commandArgs);

        observation.startVoxel();
        job.start("Creating voxel...");
        observationRepository.save(observation);
        jobService.save(job);

        return new ObservationVoxelExecution(observationId, job.getId(), commandArgs, command, voxelDir, logPath);
    }

    @Transactional
    protected void markSucceeded(Long observationId, Long jobId, String tilesetUrl, String message) {
        Observation observation = observationRepository.findById(observationId).orElse(null);
        if (observation == null) {
            return;
        }
        Job job = jobService.getRequired(jobId);
        if (job.getStatus() == JobStatus.CANCELLED || observation.getVoxelStatus() == ObservationStatus.CANCELLED) {
            return;
        }
        observation.succeedVoxel(tilesetUrl);
        job.succeed(message);
        observationRepository.save(observation);
        jobService.save(job);
    }

    @Transactional
    protected void markFailed(Long observationId, Long jobId, String message) {
        Observation observation = observationRepository.findById(observationId).orElse(null);
        if (observation == null) {
            return;
        }
        Job job = jobService.getRequired(jobId);
        if (job.getStatus() == JobStatus.CANCELLED || observation.getVoxelStatus() == ObservationStatus.CANCELLED) {
            return;
        }
        observation.failVoxel();
        job.fail(message);
        observationRepository.save(observation);
        jobService.save(job);
    }

    private record ObservationVoxelExecution(
            Long observationId,
            Long jobId,
            List<String> commandArgs,
            String command,
            Path voxelDir,
            Path logPath) {
    }
}
