package com.gaia3d.backend.diff;

import jakarta.validation.constraints.NotBlank;

public record CreateTimeSeriesDiffRequest(
        @NotBlank String name,
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
        String areaWkt) {
}
