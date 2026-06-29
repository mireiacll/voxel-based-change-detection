package com.gaia3d.backend.diff;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class DiffControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void createsAbDiffWithOneDiffItem() throws Exception {
        createProjectAndObservations();

        MvcResult createResult = mockMvc.perform(post("/api/projects/1/diffs/ab")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "2024-01 vs 2024-02",
                                  "sourceObservationId": 1,
                                  "targetObservationId": 2,
                                  "filterThreshold": 0.5,
                                  "areaWkt": "POLYGON((127.1 36.1, 127.2 36.1, 127.2 36.2, 127.1 36.2, 127.1 36.1))"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.type").value("A_B"))
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.itemCount").value(1))
                .andReturn();
        JsonNode createJson = objectMapper.readTree(createResult.getResponse().getContentAsString());

        waitForDiffSuccess(1, createJson.path("jobId").asLong());

        mockMvc.perform(get("/api/diffs/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.items[0].sourceObservationId").value(1))
                .andExpect(jsonPath("$.items[0].targetObservationId").value(2))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--sourceInput")))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--targetInput")))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--log")))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--filter-connectivity 6")))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--filter-min-level 12")))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--filter-min-neighbors 3")))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--filter-neighbor-iterations 2")))
                .andExpect(jsonPath("$.items[0].command").value(containsString("--filter-min-cluster-size 20")));

        mockMvc.perform(get("/api/diff-items/1/tileset"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tilesetUrl").value(containsString("/diffs/1/items/1/voxel/tileset.json")));
    }

    @Test
    void rejectsAbDiffWhenSourceIsNotOlderThanTarget() throws Exception {
        createProjectAndObservations();

        mockMvc.perform(post("/api/projects/1/diffs/ab")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "wrong order",
                                  "sourceObservationId": 2,
                                  "targetObservationId": 1
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createsTimeSeriesDiffFromAdjacentObservations() throws Exception {
        createProjectAndObservations();
        uploadObservation(3, "2024-03", "2024-03-01");

        MvcResult createResult = mockMvc.perform(post("/api/projects/1/diffs/time-series")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"full time series\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("TIME_SERIES"))
                .andExpect(jsonPath("$.status").value("QUEUED"))
                .andExpect(jsonPath("$.itemCount").value(2))
                .andReturn();
        JsonNode createJson = objectMapper.readTree(createResult.getResponse().getContentAsString());

        waitForDiffSuccess(1, createJson.path("jobId").asLong());

        mockMvc.perform(get("/api/diffs/1/items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sourceObservationId").value(1))
                .andExpect(jsonPath("$[0].targetObservationId").value(2))
                .andExpect(jsonPath("$[1].sourceObservationId").value(2))
                .andExpect(jsonPath("$[1].targetObservationId").value(3));
    }

    private void createProjectAndObservations() throws Exception {
        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"project\"}"))
                .andExpect(status().isCreated());
        uploadObservation(1, "2024-01", "2024-01-01");
        uploadObservation(2, "2024-02", "2024-02-01");
    }

    private void uploadObservation(long expectedObservationId, String name, String observedAt) throws Exception {
        MvcResult result = mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(zipFile())
                        .param("name", name)
                        .param("datasetType", "pointcloud")
                        .param("observedAt", observedAt))
                .andExpect(status().isAccepted())
                .andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        waitForVoxelSuccess(expectedObservationId, json.path("voxelJobId").asLong());
    }

    private void waitForVoxelSuccess(long observationId, long jobId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            MvcResult observationResult = mockMvc.perform(get("/api/observations/" + observationId + "/voxel-status"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode observationJson = objectMapper.readTree(observationResult.getResponse().getContentAsString());

            MvcResult jobResult = mockMvc.perform(get("/api/jobs/" + jobId))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode jobJson = objectMapper.readTree(jobResult.getResponse().getContentAsString());

            if ("SUCCEEDED".equals(observationJson.path("voxelStatus").asText())
                    && "SUCCEEDED".equals(jobJson.path("status").asText())) {
                return;
            }
            Thread.sleep(50);
        }
        Assertions.fail("Timed out waiting for observation " + observationId + " job " + jobId + " to succeed");
    }

    private void waitForDiffSuccess(long diffId, long jobId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            MvcResult diffResult = mockMvc.perform(get("/api/diffs/" + diffId))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode diffJson = objectMapper.readTree(diffResult.getResponse().getContentAsString());

            MvcResult jobResult = mockMvc.perform(get("/api/jobs/" + jobId))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode jobJson = objectMapper.readTree(jobResult.getResponse().getContentAsString());

            if ("SUCCEEDED".equals(diffJson.path("status").asText())
                    && "SUCCEEDED".equals(jobJson.path("status").asText())) {
                return;
            }
            Thread.sleep(50);
        }
        Assertions.fail("Timed out waiting for diff " + diffId + " job " + jobId + " to succeed");
    }

    private MockMultipartFile zipFile() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zipOutputStream = new ZipOutputStream(output)) {
            zipOutputStream.putNextEntry(new ZipEntry("tileset.json"));
            zipOutputStream.write("{}".getBytes(StandardCharsets.UTF_8));
            zipOutputStream.closeEntry();
        }
        return new MockMultipartFile("file", "tiles.zip", "application/zip", output.toByteArray());
    }
}
