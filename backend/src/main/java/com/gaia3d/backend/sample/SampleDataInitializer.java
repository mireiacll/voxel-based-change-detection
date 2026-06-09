package com.gaia3d.backend.sample;

import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class SampleDataInitializer {

    @Bean
    CommandLineRunner sampleCommandLineRunner(SampleRepository sampleRepository) {
        return args -> {
            if (sampleRepository.count() == 0) {
                sampleRepository.save(new Sample("sample-1", "Initial sample resource test"));
                sampleRepository.save(new Sample("sample-2", "Second sample resource"));
            }
        };
    }
}
