package com.gaia3d.backend.observation;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record ObservationResponse(
        Long id,
        Long projectId,
        String name,
        LocalDate observedAt,
        String originalTilesPath,
        String originalTilesetUrl,
        String voxelPath,
        String voxelTilesetUrl,
        ObservationStatus voxelStatus,
        Long voxelJobId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static ObservationResponse from(Observation observation) {
        return new ObservationResponse(
                observation.getId(),
                observation.getProjectId(),
                observation.getName(),
                observation.getObservedAt(),
                observation.getOriginalTilesPath(),
                observation.getOriginalTilesetUrl(),
                observation.getVoxelPath(),
                observation.getVoxelTilesetUrl(),
                observation.getVoxelStatus(),
                observation.getVoxelJobId(),
                observation.getCreatedAt(),
                observation.getUpdatedAt());
    }
}
