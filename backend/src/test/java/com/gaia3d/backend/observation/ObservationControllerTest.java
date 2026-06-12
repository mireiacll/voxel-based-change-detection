package com.gaia3d.backend.observation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
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
class ObservationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void uploadsObservationAndQueuesMockVoxelJob() throws Exception {
        createProject();

        MvcResult uploadResult = mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(zipFile())
                        .param("name", "2024-01-01 observation")
                        .param("datasetType", "pointcloud")
                        .param("observedAt", "2024-01-01"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.projectId").value(1))
                .andExpect(jsonPath("$.datasetType").value("pointcloud"))
                .andExpect(jsonPath("$.originalTilesetUrl")
                        .value("/files/3dtiles/projects/1/observations/1/tileset/tileset.json"))
                .andExpect(jsonPath("$.voxelStatus").value("QUEUED"))
                .andExpect(jsonPath("$.voxelJobId").value(1))
                .andExpect(jsonPath("$.voxelTilesetUrl").value(org.hamcrest.Matchers.nullValue()))
                .andReturn();

        JsonNode uploadJson = objectMapper.readTree(uploadResult.getResponse().getContentAsString());
        long observationId = uploadJson.path("id").asLong();
        long jobId = uploadJson.path("voxelJobId").asLong();

        mockMvc.perform(get("/api/observations/" + observationId + "/tileset/original"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tilesetUrl")
                        .value("/files/3dtiles/projects/1/observations/1/tileset/tileset.json"));

        mockMvc.perform(get("/files/3dtiles/projects/1/observations/1/tileset/tileset.json"))
                .andExpect(status().isOk())
                .andExpect(content().json("{}"));

        waitForVoxelSuccess(observationId, jobId);

        mockMvc.perform(get("/api/observations/" + observationId + "/voxel-status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.voxelStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.jobStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.voxelTilesetUrl")
                        .value("/files/voxelsets/projects/1/observations/1/voxel/tileset.json"));

        mockMvc.perform(get("/api/jobs/" + jobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.jobType").value("VOXEL_CREATE"))
                .andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.command").value(org.hamcrest.Matchers.containsString(" create ")));
    }

    @Test
    void rejectsZipWithoutRootTilesetJson() throws Exception {
        createProject();

        MockMultipartFile invalidZip = new MockMultipartFile(
                "file",
                "tiles.zip",
                "application/zip",
                zipBytes("nested/tileset.json", "{}"));

        mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(invalidZip)
                        .param("name", "invalid")
                        .param("datasetType", "mesh")
                        .param("observedAt", "2024-01-01"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void rejectsUploadWithoutDatasetType() throws Exception {
        createProject();

        mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(zipFile())
                        .param("name", "invalid")
                        .param("observedAt", "2024-01-01"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void regeneratesVoxelWithDefaultOptions() throws Exception {
        createProject();
        uploadObservation(1, "2024-01-01 observation", "2024-01-01");

        mockMvc.perform(post("/api/observations/1/voxelize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.voxelStatus").value("QUEUED"))
                .andExpect(jsonPath("$.voxelJobId").value(2));

        waitForVoxelSuccess(1, 2);
    }

    private void createProject() throws Exception {
        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"project\"}"))
                .andExpect(status().isCreated());
    }

    private void uploadObservation(long expectedObservationId, String name, String observedAt) throws Exception {
        mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(zipFile())
                        .param("name", name)
                        .param("datasetType", "pointcloud")
                        .param("observedAt", observedAt))
                .andExpect(status().isAccepted());
        waitForVoxelSuccess(expectedObservationId, expectedObservationId);
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

    private MockMultipartFile zipFile() throws Exception {
        return new MockMultipartFile("file", "tiles.zip", "application/zip", zipBytes("tileset.json", "{}"));
    }

    private byte[] zipBytes(String entryName, String content) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zipOutputStream = new ZipOutputStream(output)) {
            zipOutputStream.putNextEntry(new ZipEntry(entryName));
            zipOutputStream.write(content.getBytes(StandardCharsets.UTF_8));
            zipOutputStream.closeEntry();
        }
        return output.toByteArray();
    }
}
