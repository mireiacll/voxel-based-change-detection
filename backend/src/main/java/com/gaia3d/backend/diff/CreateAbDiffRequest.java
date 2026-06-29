package com.gaia3d.backend.diff;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateAbDiffRequest(
        @NotBlank String name,
        @NotNull Long sourceObservationId,
        @NotNull Long targetObservationId,
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
