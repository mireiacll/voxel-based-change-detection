package com.example.backend.demo;

import jakarta.validation.constraints.NotBlank;

public record DemoRequest(
        @NotBlank(message = "name is required")
        String name
) {
}
