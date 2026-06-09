package com.gaia3d.backend.project;

import jakarta.validation.constraints.NotBlank;

public record ProjectRequest(
        @NotBlank String name,
        String description,
        Double centerLat,
        Double centerLon,
        Double cameraHeight,
        ProjectStatus status) {
}
