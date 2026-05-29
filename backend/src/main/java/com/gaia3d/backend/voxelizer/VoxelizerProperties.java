package com.gaia3d.backend.voxelizer;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "voxelizer")
public record VoxelizerProperties(
        Path jarPath,
        Path tempPath,
        Path visualizationTilesPath,
        Path voxelSetOutputPath) {
}
