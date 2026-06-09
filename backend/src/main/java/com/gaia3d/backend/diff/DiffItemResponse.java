package com.gaia3d.backend.diff;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record DiffItemResponse(
        Long id,
        Long diffId,
        Long projectId,
        Long sourceObservationId,
        Long targetObservationId,
        LocalDate sourceObservedAt,
        LocalDate targetObservedAt,
        String sourceVoxelPath,
        String targetVoxelPath,
        String resultVoxelPath,
        String resultTilesetUrl,
        String summaryPath,
        DiffItemStatus status,
        String command,
        String logPath,
        Double addedVolume,
        Double removedVolume,
        Double changedVolume,
        LocalDateTime startedAt,
        LocalDateTime finishedAt) {

    public static DiffItemResponse from(DiffItem item) {
        return new DiffItemResponse(
                item.getId(),
                item.getDiffId(),
                item.getProjectId(),
                item.getSourceObservationId(),
                item.getTargetObservationId(),
                item.getSourceObservedAt(),
                item.getTargetObservedAt(),
                item.getSourceVoxelPath(),
                item.getTargetVoxelPath(),
                item.getResultVoxelPath(),
                item.getResultTilesetUrl(),
                item.getSummaryPath(),
                item.getStatus(),
                item.getCommand(),
                item.getLogPath(),
                item.getAddedVolume(),
                item.getRemovedVolume(),
                item.getChangedVolume(),
                item.getStartedAt(),
                item.getFinishedAt());
    }
}
