package com.gaia3d.backend.project;

import java.util.List;

import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobQueue;
import com.gaia3d.backend.job.JobService;
import com.gaia3d.backend.job.JobStatus;
import com.gaia3d.backend.job.JobTargetType;
import com.gaia3d.backend.job.JobType;
import com.gaia3d.backend.voxelizer.VoxelizerProperties;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;
    private final JobService jobService;
    private final JobQueue jobQueue;
    private final ProjectDeletionJobRunner projectDeletionJobRunner;
    private final VoxelizerProperties properties;

    public ProjectService(
            ProjectRepository projectRepository,
            JobService jobService,
            JobQueue jobQueue,
            ProjectDeletionJobRunner projectDeletionJobRunner,
            VoxelizerProperties properties) {
        this.projectRepository = projectRepository;
        this.jobService = jobService;
        this.jobQueue = jobQueue;
        this.projectDeletionJobRunner = projectDeletionJobRunner;
        this.properties = properties;
    }

    public List<ProjectResponse> findAll() {
        return projectRepository.findByStatusNotOrderByCreatedAtDesc(ProjectStatus.DELETING).stream()
                .map(ProjectResponse::from)
                .toList();
    }

    public Project getRequired(Long id) {
        Project project = getAnyRequired(id);
        if (project.getStatus() == ProjectStatus.DELETING) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "project not found: " + id);
        }
        return project;
    }

    public ProjectResponse findById(Long id) {
        return ProjectResponse.from(getRequired(id));
    }

    public ProjectResponse create(ProjectRequest request) {
        return ProjectResponse.from(projectRepository.save(new Project(
                request.name(),
                request.description(),
                request.centerLat(),
                request.centerLon(),
                request.cameraHeight())));
    }

    public ProjectResponse update(Long id, ProjectRequest request) {
        Project project = getRequired(id);
        if (request.status() == ProjectStatus.DELETING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "project status cannot be set to DELETING");
        }
        project.update(
                request.name(),
                request.description(),
                request.centerLat(),
                request.centerLon(),
                request.cameraHeight(),
                request.status());
        return ProjectResponse.from(projectRepository.save(project));
    }

    @Transactional
    public void delete(Long id) {
        Project project = getAnyRequired(id);
        if (project.getStatus() == ProjectStatus.DELETING && hasQueuedOrRunningDeleteJob(project.getId())) {
            return;
        }
        project.markDeleting();
        projectRepository.save(project);

        Job job = jobService.create(
                JobType.PROJECT_DELETE,
                JobTargetType.PROJECT,
                project.getId(),
                "Delete project " + project.getId(),
                properties.storageRoot().resolve("jobs").resolve("project-delete-" + project.getId()).resolve("process.log").toString());
        jobQueue.enqueue(job.getId(), () -> projectDeletionJobRunner.run(project.getId(), job.getId()));
    }

    private Project getAnyRequired(Long id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "project not found: " + id));
    }

    private boolean hasQueuedOrRunningDeleteJob(Long projectId) {
        return jobService.findByTarget(JobTargetType.PROJECT, projectId).stream()
                .anyMatch(job -> job.getJobType() == JobType.PROJECT_DELETE
                        && (job.getStatus() == JobStatus.QUEUED || job.getStatus() == JobStatus.RUNNING));
    }
}
