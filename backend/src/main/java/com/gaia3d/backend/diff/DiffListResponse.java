package com.gaia3d.backend.diff;

import java.time.LocalDateTime;

public record DiffListResponse(
        Long id,
        Long projectId,
        String name,
        DiffType type,
        DiffStatus status,
        Integer maxLevel,
        Boolean visualize,
        Boolean interiorOnly,
        String cubeDataType,
        long itemCount,
        LocalDateTime createdAt) {

    public static DiffListResponse from(Diff diff, long itemCount) {
        return new DiffListResponse(
                diff.getId(),
                diff.getProjectId(),
                diff.getName(),
                diff.getType(),
                diff.getStatus(),
                diff.getMaxLevel(),
                diff.getVisualize(),
                diff.getInteriorOnly(),
                diff.getCubeDataType(),
                itemCount,
                diff.getCreatedAt());
    }
}
