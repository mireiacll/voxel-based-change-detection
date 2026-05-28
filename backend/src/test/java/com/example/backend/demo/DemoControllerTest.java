package com.example.backend.demo;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class DemoControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsDemoMessage() throws Exception {
        mockMvc.perform(get("/api/demo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("demo"))
                .andExpect(jsonPath("$.message").value("Spring Boot backend is running."));
    }

    @Test
    void echoesPostedName() throws Exception {
        mockMvc.perform(post("/api/demo/echo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"tester\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("tester"))
                .andExpect(jsonPath("$.message").value("Hello, tester!"));
    }

    @Test
    void rejectsBlankName() throws Exception {
        mockMvc.perform(post("/api/demo/echo")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
    }
}
