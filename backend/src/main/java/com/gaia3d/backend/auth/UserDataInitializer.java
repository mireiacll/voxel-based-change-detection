package com.gaia3d.backend.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * Seeds the default accounts from app.auth.default-users on startup.
 * Existing accounts are never overwritten, so password changes made at
 * runtime survive restarts.
 */
@Configuration
@Profile("!test")
public class UserDataInitializer {

    private static final Logger log = LoggerFactory.getLogger(UserDataInitializer.class);

    @Bean
    CommandLineRunner userCommandLineRunner(
            UserRepository userRepository,
            AuthService authService,
            AuthProperties properties) {
        return args -> {
            if (properties.defaultUsers() == null) {
                return;
            }
            for (AuthProperties.DefaultUser def : properties.defaultUsers()) {
                if (userRepository.existsByUsername(def.username())) {
                    continue;
                }
                userRepository.save(new User(
                        def.username(),
                        authService.encodePassword(def.password()),
                        def.displayName(),
                        def.role()));
                log.info("Seeded default user '{}' (role={})", def.username(), def.role());
            }
        };
    }
}
