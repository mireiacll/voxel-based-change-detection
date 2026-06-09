package com.gaia3d.backend.observation;

import java.time.LocalDate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ObservationUpdateRequest(@NotBlank String name, @NotNull LocalDate observedAt) {
}
