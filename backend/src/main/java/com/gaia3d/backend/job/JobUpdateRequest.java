package com.gaia3d.backend.job;

public record JobUpdateRequest(
        JobStatus status,
        Integer progress,
        String message) {
}
