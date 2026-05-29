package com.gaia3d.backend.voxelizer;

import java.nio.file.Path;
import java.time.Instant;

public record VoxelizerJob(
        String id,
        VoxelizerJobStatus status,
        Path sourcePath,
        Path preparedTilesPath,
        Path voxelSetPath,
        Instant createdAt,
        Instant startedAt,
        Instant finishedAt,
        Integer exitCode,
        String message) {
}
