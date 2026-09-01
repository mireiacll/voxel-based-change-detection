package com.gaia3d.backend.project;

import java.time.LocalDateTime;

public record ProjectResponse(
        Long id,
        String name,
        String description,
        Double centerLat,
        Double centerLon,
        Double cameraHeight,
        ProjectStatus status,
        Long ownerId,
        String ownerUsername,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static ProjectResponse from(Project project) {
        return new ProjectResponse(
                project.getId(),
                project.getName(),
                project.getDescription(),
                project.getCenterLat(),
                project.getCenterLon(),
                project.getCameraHeight(),
                project.getStatus(),
                project.getOwnerId(),
                project.getOwnerUsername(),
                project.getCreatedAt(),
                project.getUpdatedAt());
    }
}
