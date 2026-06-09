package com.gaia3d.backend.job;

import java.time.LocalDateTime;

import com.gaia3d.backend.common.BaseTimeEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "jobs")
public class Job extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private JobType jobType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private JobTargetType targetType;

    @Column(nullable = false)
    private Long targetId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private JobStatus status;

    private Integer progress;

    @Column(length = 1000)
    private String message;

    @Column(length = 4000)
    private String command;

    private String logPath;

    private LocalDateTime startedAt;

    private LocalDateTime finishedAt;

    protected Job() {
    }

    public Job(JobType jobType, JobTargetType targetType, Long targetId, String command, String logPath) {
        this.jobType = jobType;
        this.targetType = targetType;
        this.targetId = targetId;
        this.status = JobStatus.QUEUED;
        this.progress = 0;
        this.command = command;
        this.logPath = logPath;
        this.message = "Queued";
    }

    public void start(String message) {
        status = JobStatus.RUNNING;
        progress = 10;
        startedAt = LocalDateTime.now();
        this.message = message;
    }

    public void succeed(String message) {
        status = JobStatus.SUCCEEDED;
        progress = 100;
        finishedAt = LocalDateTime.now();
        this.message = message;
    }

    public void fail(String message) {
        status = JobStatus.FAILED;
        finishedAt = LocalDateTime.now();
        this.message = message;
    }

    public void cancel() {
        if (status == JobStatus.SUCCEEDED || status == JobStatus.FAILED) {
            return;
        }
        status = JobStatus.CANCELLED;
        finishedAt = LocalDateTime.now();
        message = "Cancelled";
    }

    public Long getId() { return id; }
    public JobType getJobType() { return jobType; }
    public JobTargetType getTargetType() { return targetType; }
    public Long getTargetId() { return targetId; }
    public JobStatus getStatus() { return status; }
    public Integer getProgress() { return progress; }
    public String getMessage() { return message; }
    public String getCommand() { return command; }
    public String getLogPath() { return logPath; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public LocalDateTime getFinishedAt() { return finishedAt; }
}
