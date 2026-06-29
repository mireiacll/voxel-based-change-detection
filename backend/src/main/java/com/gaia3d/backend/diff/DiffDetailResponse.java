package com.gaia3d.backend.diff;

import java.time.LocalDateTime;
import java.util.List;

public record DiffDetailResponse(
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
        Boolean massSummary,
        String cubeDataType,
        Boolean recursive,
        Double filterThreshold,
        String areaWkt,
        Long jobId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        List<DiffItemResponse> items) {

    public static DiffDetailResponse from(Diff diff, List<DiffItem> items) {
        return new DiffDetailResponse(
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
                diff.getMassSummary(),
                diff.getCubeDataType(),
                diff.getRecursive(),
                diff.getFilterThreshold(),
                diff.getAreaWkt(),
                diff.getJobId(),
                diff.getCreatedAt(),
                diff.getUpdatedAt(),
                items.stream().map(DiffItemResponse::from).toList());
    }
}
