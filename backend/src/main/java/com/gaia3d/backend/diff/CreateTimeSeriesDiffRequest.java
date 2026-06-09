package com.gaia3d.backend.diff;

import jakarta.validation.constraints.NotBlank;

public record CreateTimeSeriesDiffRequest(
        @NotBlank String name,
        Integer maxLevel,
        Boolean visualize,
        Boolean interiorOnly,
        Boolean massSummary,
        String cubeDataType,
        Boolean recursive,
        Double filterThreshold,
        String areaWkt) {
}
