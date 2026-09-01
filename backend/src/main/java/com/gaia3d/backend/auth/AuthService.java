package com.gaia3d.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final AuthTokenStore tokenStore;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository userRepository, AuthTokenStore tokenStore) {
        this.userRepository = userRepository;
        this.tokenStore = tokenStore;
    }

    public LoginResponse login(String username, String password) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다."));
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        String token = tokenStore.issue(user.getId());
        return new LoginResponse(token, UserResponse.from(user));
    }

    public void logout(String token) {
        tokenStore.revoke(token);
    }

    /** Returns the user bound to the token, or null if invalid/expired. */
    public User resolveToken(String token) {
        Long userId = tokenStore.resolve(token);
        if (userId == null) {
            return null;
        }
        return userRepository.findById(userId).orElse(null);
    }

    public String encodePassword(String rawPassword) {
        return passwordEncoder.encode(rawPassword);
    }
}
