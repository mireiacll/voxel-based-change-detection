package com.gaia3d.backend.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(
        @DefaultValue({"http://localhost:*", "http://127.0.0.1:*"})
        List<String> allowedOriginPatterns,
        @DefaultValue({"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"})
        List<String> allowedMethods,
        @DefaultValue("*")
        List<String> allowedHeaders,
        @DefaultValue({"Location"})
        List<String> exposedHeaders,
        @DefaultValue("3600")
        long maxAge) {
}
