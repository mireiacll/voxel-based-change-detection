package com.gaia3d.backend.project;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("!test")
public class ProjectDataInitializer {

    @Bean
    CommandLineRunner projectCommandLineRunner(ProjectRepository projectRepository) {
        return args -> {
            if (projectRepository.count() == 0) {
                projectRepository.save(new Project(
                        "Sample Change Detection Project",
                        "Frontend smoke-test project. Upload observations to this project first.",
                        36.123,
                        127.123,
                        1500.0));
            }
        };
    }
}
