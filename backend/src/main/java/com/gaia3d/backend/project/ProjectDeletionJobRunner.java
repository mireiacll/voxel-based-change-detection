package com.gaia3d.backend.project;

import com.gaia3d.backend.common.CascadeDeletionService;
import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobService;
import com.gaia3d.backend.job.JobStatus;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ProjectDeletionJobRunner {

    private final ProjectRepository projectRepository;
    private final CascadeDeletionService cascadeDeletionService;
    private final JobService jobService;
    private final TransactionTemplate transactionTemplate;

    public ProjectDeletionJobRunner(
            ProjectRepository projectRepository,
            CascadeDeletionService cascadeDeletionService,
            JobService jobService,
            TransactionTemplate transactionTemplate) {
        this.projectRepository = projectRepository;
        this.cascadeDeletionService = cascadeDeletionService;
        this.jobService = jobService;
        this.transactionTemplate = transactionTemplate;
    }

    public void run(Long projectId, Long jobId) {
        Boolean started = transactionTemplate.execute(status -> start(projectId, jobId));
        if (!Boolean.TRUE.equals(started)) {
            return;
        }

        try {
            cascadeDeletionService.deleteProjectContents(projectId);
            transactionTemplate.executeWithoutResult(status -> complete(projectId, jobId));
        } catch (Exception exception) {
            transactionTemplate.executeWithoutResult(status -> fail(jobId, exception));
        }
    }

    private boolean start(Long projectId, Long jobId) {
        Project project = projectRepository.findById(projectId).orElse(null);
        Job job = jobService.find(jobId);
        if (project == null || project.getStatus() != ProjectStatus.DELETING || job == null
                || job.getStatus() != JobStatus.QUEUED) {
            return false;
        }
        job.start("Deleting project...");
        jobService.save(job);
        return true;
    }

    private void complete(Long projectId, Long jobId) {
        Job job = jobService.find(jobId);
        if (job == null) {
            return;
        }
        projectRepository.findById(projectId).ifPresent(projectRepository::delete);
        job.succeed("Project deleted");
        jobService.save(job);
    }

    private void fail(Long jobId, Exception exception) {
        Job job = jobService.find(jobId);
        if (job == null) {
            return;
        }
        String message = exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
        job.fail("Project deletion failed: " + message);
        jobService.save(job);
    }
}
