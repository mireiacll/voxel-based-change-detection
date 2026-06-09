package com.gaia3d.backend.diff;

import java.time.LocalDate;
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
@Table(name = "diff_items")
public class DiffItem extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long diffId;

    @Column(nullable = false)
    private Long projectId;

    @Column(nullable = false)
    private Long sourceObservationId;

    @Column(nullable = false)
    private Long targetObservationId;

    @Column(nullable = false)
    private LocalDate sourceObservedAt;

    @Column(nullable = false)
    private LocalDate targetObservedAt;

    private String sourceVoxelPath;
    private String targetVoxelPath;
    private String resultVoxelPath;
    private String resultTilesetUrl;
    private String summaryPath;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private DiffItemStatus status = DiffItemStatus.QUEUED;

    @Column(length = 4000)
    private String command;

    private String logPath;
    private Double addedVolume;
    private Double removedVolume;
    private Double changedVolume;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;

    protected DiffItem() {
    }

    public DiffItem(
            Long diffId,
            Long projectId,
            Long sourceObservationId,
            Long targetObservationId,
            LocalDate sourceObservedAt,
            LocalDate targetObservedAt,
            String sourceVoxelPath,
            String targetVoxelPath) {
        this.diffId = diffId;
        this.projectId = projectId;
        this.sourceObservationId = sourceObservationId;
        this.targetObservationId = targetObservationId;
        this.sourceObservedAt = sourceObservedAt;
        this.targetObservedAt = targetObservedAt;
        this.sourceVoxelPath = sourceVoxelPath;
        this.targetVoxelPath = targetVoxelPath;
    }

    public void prepareResult(String resultVoxelPath, String resultTilesetUrl, String summaryPath, String command,
            String logPath) {
        this.resultVoxelPath = resultVoxelPath;
        this.resultTilesetUrl = resultTilesetUrl;
        this.summaryPath = summaryPath;
        this.command = command;
        this.logPath = logPath;
    }

    public void start() {
        status = DiffItemStatus.RUNNING;
        startedAt = LocalDateTime.now();
    }

    public void succeed() {
        status = DiffItemStatus.SUCCEEDED;
        finishedAt = LocalDateTime.now();
        addedVolume = 0.0;
        removedVolume = 0.0;
        changedVolume = 0.0;
    }

    public void fail() {
        status = DiffItemStatus.FAILED;
        finishedAt = LocalDateTime.now();
    }

    public void cancel() {
        if (status == DiffItemStatus.SUCCEEDED || status == DiffItemStatus.FAILED) {
            return;
        }
        status = DiffItemStatus.CANCELLED;
        finishedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public Long getDiffId() { return diffId; }
    public Long getProjectId() { return projectId; }
    public Long getSourceObservationId() { return sourceObservationId; }
    public Long getTargetObservationId() { return targetObservationId; }
    public LocalDate getSourceObservedAt() { return sourceObservedAt; }
    public LocalDate getTargetObservedAt() { return targetObservedAt; }
    public String getSourceVoxelPath() { return sourceVoxelPath; }
    public String getTargetVoxelPath() { return targetVoxelPath; }
    public String getResultVoxelPath() { return resultVoxelPath; }
    public String getResultTilesetUrl() { return resultTilesetUrl; }
    public String getSummaryPath() { return summaryPath; }
    public DiffItemStatus getStatus() { return status; }
    public String getCommand() { return command; }
    public String getLogPath() { return logPath; }
    public Double getAddedVolume() { return addedVolume; }
    public Double getRemovedVolume() { return removedVolume; }
    public Double getChangedVolume() { return changedVolume; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public LocalDateTime getFinishedAt() { return finishedAt; }
}
