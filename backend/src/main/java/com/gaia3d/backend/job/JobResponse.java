package com.gaia3d.backend.job;

import java.time.LocalDateTime;

public record JobResponse(
        Long id,
        JobType jobType,
        JobTargetType targetType,
        Long targetId,
        JobStatus status,
        Integer progress,
        String message,
        String command,
        String logPath,
        LocalDateTime startedAt,
        LocalDateTime finishedAt) {

    public static JobResponse from(Job job) {
        return new JobResponse(
                job.getId(),
                job.getJobType(),
                job.getTargetType(),
                job.getTargetId(),
                job.getStatus(),
                job.getProgress(),
                job.getMessage(),
                job.getCommand(),
                job.getLogPath(),
                job.getStartedAt(),
                job.getFinishedAt());
    }
}
