package com.gaia3d.backend.auth;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        @DefaultValue("24")
        long tokenTtlHours,
        List<DefaultUser> defaultUsers) {

    public record DefaultUser(
            String username,
            String password,
            String displayName,
            @DefaultValue("USER")
            UserRole role) {
    }
}
