package com.gaia3d.backend.job;

import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
public class JobController {

    private final JobService jobService;

    public JobController(JobService jobService) {
        this.jobService = jobService;
    }

    @GetMapping
    public List<JobResponse> list() {
        return jobService.findAll();
    }

    @GetMapping("/{jobId}")
    public JobResponse get(@PathVariable Long jobId) {
        return jobService.findById(jobId);
    }

    @PutMapping("/{jobId}")
    public JobResponse update(@PathVariable Long jobId, @RequestBody JobUpdateRequest request) {
        return jobService.update(jobId, request);
    }

    @PostMapping("/{jobId}/cancel")
    public JobResponse cancel(@PathVariable Long jobId) {
        return jobService.cancel(jobId);
    }

    @DeleteMapping("/{jobId}")
    public ResponseEntity<Void> delete(@PathVariable Long jobId) {
        jobService.delete(jobId);
        return ResponseEntity.noContent().build();
    }
}
