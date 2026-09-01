package com.gaia3d.backend.auth;

public record LoginResponse(
        String token,
        UserResponse user) {
}
