package com.gaia3d.backend.job;

import java.util.List;

import com.gaia3d.backend.diff.DiffItemRepository;
import com.gaia3d.backend.diff.DiffRepository;
import com.gaia3d.backend.observation.ObservationRepository;
import com.gaia3d.backend.voxelizer.VoxelizerProcessService;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class JobService {

    private final JobRepository jobRepository;
    private final ObservationRepository observationRepository;
    private final DiffRepository diffRepository;
    private final DiffItemRepository diffItemRepository;
    private final VoxelizerProcessService processService;

    public JobService(
            JobRepository jobRepository,
            ObservationRepository observationRepository,
            DiffRepository diffRepository,
            DiffItemRepository diffItemRepository,
            VoxelizerProcessService processService) {
        this.jobRepository = jobRepository;
        this.observationRepository = observationRepository;
        this.diffRepository = diffRepository;
        this.diffItemRepository = diffItemRepository;
        this.processService = processService;
    }

    public Job create(JobType jobType, JobTargetType targetType, Long targetId, String command, String logPath) {
        return jobRepository.save(new Job(jobType, targetType, targetId, command, logPath));
    }

    public Job save(Job job) {
        return jobRepository.save(job);
    }

    public Job getRequired(Long id) {
        return jobRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "job not found: " + id));
    }

    public JobResponse findById(Long id) {
        return JobResponse.from(getRequired(id));
    }

    public List<JobResponse> findAll() {
        return jobRepository.findAllByOrderByCreatedAtAscIdAsc().stream()
                .map(JobResponse::from)
                .toList();
    }

    @Transactional
    public JobResponse update(Long id, JobUpdateRequest request) {
        Job job = getRequired(id);
        job.update(request.status(), request.progress(), request.message());
        return JobResponse.from(jobRepository.save(job));
    }

    @Transactional
    public void delete(Long id) {
        Job job = getRequired(id);
        if (job.getStatus() == JobStatus.RUNNING || job.getStatus() == JobStatus.QUEUED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "queued or running job cannot be deleted");
        }
        jobRepository.delete(job);
    }

    @Transactional
    public JobResponse cancel(Long id) {
        Job job = getRequired(id);
        if (job.getStatus() == JobStatus.SUCCEEDED || job.getStatus() == JobStatus.FAILED
                || job.getStatus() == JobStatus.CANCELLED) {
            return JobResponse.from(job);
        }
        job.cancel();
        processService.cancel(id);
        if (job.getTargetType() == JobTargetType.OBSERVATION && job.getJobType() == JobType.VOXEL_CREATE) {
            observationRepository.findById(job.getTargetId()).ifPresent(observation -> {
                observation.cancelVoxel();
                observationRepository.save(observation);
            });
        } else if (job.getTargetType() == JobTargetType.DIFF && job.getJobType() == JobType.DIFF_CREATE) {
            diffRepository.findById(job.getTargetId()).ifPresent(diff -> {
                diff.finish(com.gaia3d.backend.diff.DiffStatus.CANCELLED);
                diffRepository.save(diff);
                diffItemRepository.findByDiffIdOrderBySourceObservedAtAsc(diff.getId()).forEach(item -> {
                    item.cancel();
                    diffItemRepository.save(item);
                });
            });
        }
        return JobResponse.from(jobRepository.save(job));
    }
}
