package com.gaia3d.backend.job;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class JobService {

    private final JobRepository jobRepository;

    public JobService(JobRepository jobRepository) {
        this.jobRepository = jobRepository;
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

    public JobResponse cancel(Long id) {
        Job job = getRequired(id);
        job.cancel();
        return JobResponse.from(jobRepository.save(job));
    }
}
