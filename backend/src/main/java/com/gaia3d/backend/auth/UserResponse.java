package com.gaia3d.backend.auth;

public record UserResponse(
        Long id,
        String username,
        String displayName,
        UserRole role) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(),
                user.getUsername(),
                user.getDisplayName(),
                user.getRole());
    }
}
