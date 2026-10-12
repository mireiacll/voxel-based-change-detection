package com.gaia3d.backend.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = {"AUTH_USERNAME=test-user", "AUTH_PASSWORD=test-password"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthenticationTest {
    @Autowired MockMvc mvc;

    @Test
    void anonymousCannotReadApiFilesOrDocumentation() throws Exception {
        for (String path : new String[]{"/api/projects", "/files/private/tileset.json", "/data/private.b3dm", "/v3/api-docs", "/api/auth/me"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void validLoginCreatesSessionAndLogoutRevokesIt() throws Exception {
        var csrfResult = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        var csrfBody = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(csrfResult.getResponse().getContentAsString());
        var result = mvc.perform(post("/api/auth/login")
                        .session((MockHttpSession) csrfResult.getRequest().getSession(false))
                        .header(csrfBody.get("headerName").asText(), csrfBody.get("token").asText())
                        .param("username", "test-user").param("password", "test-password"))
                .andExpect(status().isNoContent()).andReturn();
        var session = (MockHttpSession) result.getRequest().getSession(false);
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("test-user"));
        mvc.perform(get("/api/projects").session(session)).andExpect(status().isOk());
        mvc.perform(post("/api/projects").session(session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());
        org.junit.jupiter.api.Assertions.assertTrue(session.isInvalid());
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void wrongCredentialsAndMissingCsrfAreRejected() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf())
                .param("username", "other-user").param("password", "test-password"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(csrf())
                .param("username", "test-user").param("password", "wrong"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").param("username", "test-user")
                .param("password", "test-password")).andExpect(status().isForbidden());
    }
}
