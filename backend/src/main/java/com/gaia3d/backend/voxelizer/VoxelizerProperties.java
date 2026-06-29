package com.gaia3d.backend.voxelizer;

import java.nio.file.Path;

import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "voxelizer")
public record VoxelizerProperties(
        Path jarPath,
        Path tempPath,
        Path visualizationTilesPath,
        Path voxelSetOutputPath,
        @DefaultValue("/data") Path storageRoot,
        @DefaultValue("true") boolean mockExecution,
        @DefaultValue DefaultCreate defaultCreate,
        @DefaultValue DefaultDiff defaultDiff) {

    public record DefaultCreate(
            @DefaultValue("16") int maxLevel,
            @DefaultValue("true") boolean visualize,
            @DefaultValue("gray") String visualizeColor,
            @DefaultValue("BYTE") String cubeDataType,
            Path regionGpkgPath,
            @DefaultValue("true") boolean recursive) {
    }

    public record DefaultDiff(
            @DefaultValue("16") int maxLevel,
            @DefaultValue("ADD_AND_REMOVE") String diffOperation,
            @DefaultValue("true") boolean visualize,
            @DefaultValue("6") int diffNeighborMode,
            @DefaultValue("12") int minDiffFilterLevel,
            @DefaultValue("3") int minDiffNeighbors,
            @DefaultValue("2") int diffNeighborIterations,
            @DefaultValue("20") int minDiffClusterSize,
            @DefaultValue("true") boolean massSummary,
            @DefaultValue("BYTE") String cubeDataType,
            @DefaultValue("true") boolean recursive) {
    }
}
