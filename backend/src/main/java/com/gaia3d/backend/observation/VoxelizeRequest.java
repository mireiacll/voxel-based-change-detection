package com.gaia3d.backend.observation;

public record VoxelizeRequest(
        Integer maxLevel,
        Boolean visualize,
        String visualizeColor,
        String cubeDataType,
        Boolean recursive) {
}
