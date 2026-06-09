package com.gaia3d.backend.sample;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class SampleControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void listsSeededSamples() throws Exception {
        mockMvc.perform(get("/api/samples"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].name").value("sample-1"))
                .andExpect(jsonPath("$[0].description").value("Initial sample resource test"));
    }

    @Test
    void getsSampleById() throws Exception {
        mockMvc.perform(get("/api/samples/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("sample-1"));
    }

    @Test
    void createsSampleWithPost() throws Exception {
        mockMvc.perform(post("/api/samples")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"sample-2\",\"description\":\"Created by POST\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/samples/3"))
                .andExpect(jsonPath("$.id").value(3))
                .andExpect(jsonPath("$.name").value("sample-2"))
                .andExpect(jsonPath("$.description").value("Created by POST"));
    }

    @Test
    void updatesSampleWithPut() throws Exception {
        mockMvc.perform(put("/api/samples/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"sample-1-updated\",\"description\":\"Updated by PUT\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.name").value("sample-1-updated"))
                .andExpect(jsonPath("$.description").value("Updated by PUT"));
    }

    @Test
    void deletesSampleWithDelete() throws Exception {
        mockMvc.perform(delete("/api/samples/1"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/samples/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsBlankNameOnCreate() throws Exception {
        mockMvc.perform(post("/api/samples")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\",\"description\":\"Invalid payload\"}"))
                .andExpect(status().isBadRequest());
    }
}
