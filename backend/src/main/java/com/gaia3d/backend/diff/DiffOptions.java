package com.gaia3d.backend.diff;

public record DiffOptions(
        Integer maxLevel,
        Boolean visualize,
        String visualizeColor,
        Boolean interiorOnly,
        Boolean massSummary,
        String cubeDataType,
        Boolean recursive,
        Double filterThreshold,
        String areaWkt) {
}
