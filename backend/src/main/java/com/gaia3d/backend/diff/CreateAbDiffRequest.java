package com.gaia3d.backend.diff;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateAbDiffRequest(
        @NotBlank String name,
        @NotNull Long sourceObservationId,
        @NotNull Long targetObservationId,
        Integer maxLevel,
        Boolean visualize,
        Boolean interiorOnly,
        Boolean massSummary,
        String cubeDataType,
        Boolean recursive,
        Double filterThreshold,
        String areaWkt) {
}
