package com.gaia3d.backend.diff;

public record DiffOptions(
        Integer maxLevel,
        Boolean visualize,
        String visualizeColor,
        Integer diffNeighborMode,
        Integer minDiffFilterLevel,
        Integer minDiffNeighbors,
        Integer diffNeighborIterations,
        Integer minDiffClusterSize,
        Boolean union,
        Boolean massSummary,
        String cubeDataType,
        Boolean recursive,
        Double filterThreshold,
        String areaWkt) {
}
