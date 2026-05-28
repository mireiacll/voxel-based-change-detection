package com.example.backend.sample;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SampleRequest(
        @Schema(description = "Sample resource name", example = "sample-2")
        @NotBlank(message = "name is required")
        @Size(max = 50, message = "name must be 50 characters or less")
        String name,

        @Schema(description = "Sample resource description", example = "Created from Swagger UI")
        @NotBlank(message = "description is required")
        @Size(max = 200, message = "description must be 200 characters or less")
        String description
) {
}
