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
        Integer diffNeighborMode,
        Integer minDiffFilterLevel,
        Integer minDiffNeighbors,
        Integer diffNeighborIterations,
        Integer minDiffClusterSize,
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
                diff.getDiffNeighborMode(),
                diff.getMinDiffFilterLevel(),
                diff.getMinDiffNeighbors(),
                diff.getDiffNeighborIterations(),
                diff.getMinDiffClusterSize(),
                diff.getCubeDataType(),
                itemCount,
                diff.getCreatedAt());
    }
}
