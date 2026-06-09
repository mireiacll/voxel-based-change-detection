package com.gaia3d.backend.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI backendOpenApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("Voxel-Based Change Detection API")
                        .description("Project, observation, voxel job, diff, and diff item API documentation.")
                        .version("v1"));
    }
}
