package com.gaia3d.backend.auth;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * In-memory bearer-token store. Tokens survive only as long as the backend
 * process — a restart just forces users to log in again.
 */
@Component
public class AuthTokenStore {

    private record TokenInfo(Long userId, Instant expiresAt) {
    }

    private final SecureRandom random = new SecureRandom();
    private final Map<String, TokenInfo> tokens = new ConcurrentHashMap<>();
    private final Duration ttl;

    public AuthTokenStore(AuthProperties properties) {
        this.ttl = Duration.ofHours(properties.tokenTtlHours());
    }

    public String issue(Long userId) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokens.put(token, new TokenInfo(userId, Instant.now().plus(ttl)));
        return token;
    }

    /** Returns the user id for a valid token (sliding expiry), or null. */
    public Long resolve(String token) {
        if (token == null) {
            return null;
        }
        TokenInfo info = tokens.get(token);
        if (info == null) {
            return null;
        }
        if (info.expiresAt().isBefore(Instant.now())) {
            tokens.remove(token);
            return null;
        }
        tokens.put(token, new TokenInfo(info.userId(), Instant.now().plus(ttl)));
        return info.userId();
    }

    public void revoke(String token) {
        if (token != null) {
            tokens.remove(token);
        }
    }
}
