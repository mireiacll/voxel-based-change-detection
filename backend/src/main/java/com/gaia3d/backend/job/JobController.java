package com.gaia3d.backend.job;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobService jobService;

    public JobController(JobService jobService) {
        this.jobService = jobService;
    }

    @GetMapping("/{jobId}")
    public JobResponse get(@PathVariable Long jobId) {
        return jobService.findById(jobId);
    }

    @PostMapping("/{jobId}/cancel")
    public JobResponse cancel(@PathVariable Long jobId) {
        return jobService.cancel(jobId);
    }
}
