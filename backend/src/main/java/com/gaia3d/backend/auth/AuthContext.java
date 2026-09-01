package com.gaia3d.backend.auth;

/**
 * Holds the authenticated user for the current request thread.
 * Populated by {@link AuthInterceptor}; empty on background job threads,
 * where ownership checks are intentionally skipped.
 */
public final class AuthContext {

    private static final ThreadLocal<User> CURRENT = new ThreadLocal<>();

    private AuthContext() {
    }

    public static void set(User user) {
        CURRENT.set(user);
    }

    public static User get() {
        return CURRENT.get();
    }

    public static void clear() {
        CURRENT.remove();
    }
}
