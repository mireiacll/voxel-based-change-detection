package com.gaia3d.backend.job;

import com.gaia3d.backend.observation.ObservationRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class JobService {

    private final JobRepository jobRepository;
    private final ObservationRepository observationRepository;

    public JobService(JobRepository jobRepository, ObservationRepository observationRepository) {
        this.jobRepository = jobRepository;
        this.observationRepository = observationRepository;
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

    @Transactional
    public JobResponse cancel(Long id) {
        Job job = getRequired(id);
        job.cancel();
        if (job.getTargetType() == JobTargetType.OBSERVATION && job.getJobType() == JobType.VOXEL_CREATE) {
            observationRepository.findById(job.getTargetId()).ifPresent(observation -> {
                observation.cancelVoxel();
                observationRepository.save(observation);
            });
        }
        return JobResponse.from(jobRepository.save(job));
    }
}
