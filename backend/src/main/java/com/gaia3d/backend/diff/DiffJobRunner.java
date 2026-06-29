package com.gaia3d.backend.diff;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

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
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class DiffJobRunner {

    private static final Logger log = LoggerFactory.getLogger(DiffJobRunner.class);
    private static final String DIFF_OPERATION = "ADD_AND_REMOVE";

    private final DiffRepository diffRepository;
    private final DiffItemRepository diffItemRepository;
    private final JobService jobService;
    private final VoxelizerCommandService commandService;
    private final VoxelizerProcessService processService;
    private final VoxelizerProperties properties;
    private final TransactionTemplate transactionTemplate;

    public DiffJobRunner(
            DiffRepository diffRepository,
            DiffItemRepository diffItemRepository,
            JobService jobService,
            VoxelizerCommandService commandService,
            VoxelizerProcessService processService,
            VoxelizerProperties properties,
            TransactionTemplate transactionTemplate) {
        this.diffRepository = diffRepository;
        this.diffItemRepository = diffItemRepository;
        this.jobService = jobService;
        this.commandService = commandService;
        this.processService = processService;
        this.properties = properties;
        this.transactionTemplate = transactionTemplate;
    }

    public void run(Long diffId, Long jobId) {
        Boolean started = transactionTemplate.execute(status -> start(diffId, jobId));
        if (!Boolean.TRUE.equals(started)) {
            return;
        }

        List<Long> itemIds = transactionTemplate.execute(status ->
                diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diffId).stream()
                        .map(DiffItem::getId)
                        .toList());
        if (itemIds == null) {
            return;
        }

        int succeeded = 0;
        for (Long itemId : itemIds) {
            DiffItemExecution execution = transactionTemplate.execute(status -> startItem(diffId, jobId, itemId));
            if (execution == null) {
                break;
            }

            try {
                Files.createDirectories(execution.outputPath());
                if (properties.mockExecution()) {
                    log.info("[diff:{} item:{}] mock queued voxelizer diff", diffId, itemId);
                    transactionTemplate.executeWithoutResult(status -> succeedItem(itemId));
                    succeeded++;
                    continue;
                }

                log.info("[diff:{} item:{}] running queued voxelizer diff", diffId, itemId);
                VoxelizerProcessResult result = processService.run(jobId, execution.commandArgs(), execution.logPath());
                if (result.succeeded()) {
                    transactionTemplate.executeWithoutResult(status -> succeedItem(itemId));
                    succeeded++;
                } else if (!Boolean.TRUE.equals(transactionTemplate.execute(status -> isCancelled(diffId, jobId)))) {
                    transactionTemplate.executeWithoutResult(status -> failItem(itemId));
                }
            } catch (IOException | InterruptedException exception) {
                if (exception instanceof InterruptedException) {
                    Thread.currentThread().interrupt();
                }
                log.warn("[diff:{} item:{}] queued voxelizer diff failed", diffId, itemId, exception);
                if (!Boolean.TRUE.equals(transactionTemplate.execute(status -> isCancelled(diffId, jobId)))) {
                    transactionTemplate.executeWithoutResult(status -> failItem(itemId));
                }
            }
        }

        int finalSucceeded = succeeded;
        transactionTemplate.executeWithoutResult(status -> finish(diffId, jobId, finalSucceeded));
    }

    private boolean start(Long diffId, Long jobId) {
        Diff diff = diffRepository.findById(diffId).orElse(null);
        if (diff == null || diff.getStatus() != DiffStatus.QUEUED) {
            return false;
        }
        Job job = jobService.find(jobId);
        if (job == null) {
            return false;
        }
        if (job.getStatus() == JobStatus.CANCELLED || job.getStatus() != JobStatus.QUEUED) {
            return false;
        }
        diff.start();
        job.start("Creating diff voxel...");
        diffRepository.save(diff);
        jobService.save(job);
        return true;
    }

    private DiffItemExecution startItem(Long diffId, Long jobId, Long itemId) {
        if (isCancelled(diffId, jobId)) {
            return null;
        }
        Diff diff = diffRepository.findById(diffId).orElse(null);
        DiffItem item = diffItemRepository.findById(itemId).orElse(null);
        if (diff == null || item == null || item.getStatus() != DiffItemStatus.QUEUED) {
            return null;
        }
        item.start();
        diffItemRepository.save(item);

        Path output = Path.of(item.getResultVoxelPath());
        Path logPath = output.resolve("log.txt").toAbsolutePath().normalize();
        List<String> commandArgs = commandService.createDiffCommandArgs(
                Path.of(item.getSourceVoxelPath()),
                Path.of(item.getTargetVoxelPath()),
                output,
                logPath,
                diff.getMaxLevel(),
                DIFF_OPERATION,
                diff.getVisualize(),
                diff.getDiffNeighborMode(),
                diff.getMinDiffFilterLevel(),
                diff.getMinDiffNeighbors(),
                diff.getDiffNeighborIterations(),
                diff.getMinDiffClusterSize(),
                diff.getMassSummary(),
                diff.getCubeDataType(),
                diff.getAreaWkt(),
                diff.getRecursive());
        return new DiffItemExecution(output, logPath, commandArgs);
    }

    private void succeedItem(Long itemId) {
        diffItemRepository.findById(itemId).ifPresent(item -> {
            item.succeed();
            diffItemRepository.save(item);
        });
    }

    private void failItem(Long itemId) {
        diffItemRepository.findById(itemId).ifPresent(item -> {
            item.fail();
            diffItemRepository.save(item);
        });
    }

    private boolean isCancelled(Long diffId, Long jobId) {
        Job job = jobService.find(jobId);
        Diff diff = diffRepository.findById(diffId).orElse(null);
        return job == null || job.getStatus() == JobStatus.CANCELLED
                || diff == null || diff.getStatus() == DiffStatus.CANCELLED;
    }

    private void finish(Long diffId, Long jobId, int succeeded) {
        Diff diff = diffRepository.findById(diffId).orElse(null);
        if (diff == null) {
            return;
        }
        Job job = jobService.find(jobId);
        if (job == null) {
            return;
        }
        if (job.getStatus() == JobStatus.CANCELLED || diff.getStatus() == DiffStatus.CANCELLED) {
            return;
        }

        List<DiffItem> items = diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diffId);
        if (succeeded == items.size()) {
            diff.finish(DiffStatus.SUCCEEDED);
            job.succeed("Diff creation completed");
        } else if (succeeded == 0) {
            diff.finish(DiffStatus.FAILED);
            job.fail("All diff items failed");
        } else {
            diff.finish(DiffStatus.PARTIAL_FAILED);
            job.fail("Some diff items failed");
        }
        diffRepository.save(diff);
        jobService.save(job);
    }

    private record DiffItemExecution(Path outputPath, Path logPath, List<String> commandArgs) {
    }
}
