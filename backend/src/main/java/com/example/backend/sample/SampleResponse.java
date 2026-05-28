package com.example.backend.sample;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Sample resource response")
public record SampleResponse(
        @Schema(description = "Sample resource identifier", example = "1")
        Long id,

        @Schema(description = "Sample resource name", example = "sample-1")
        String name,

        @Schema(description = "Sample resource description", example = "Initial sample resource")
        String description
) {
}
