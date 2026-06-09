package com.gaia3d.backend.observation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class ObservationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void uploadsObservationAndCreatesMockVoxelJob() throws Exception {
        createProject();

        mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(zipFile())
                        .param("name", "2024-01-01 observation")
                        .param("observedAt", "2024-01-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.projectId").value(1))
                .andExpect(jsonPath("$.originalTilesetUrl").isString())
                .andExpect(jsonPath("$.voxelStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.voxelJobId").value(1))
                .andExpect(jsonPath("$.voxelTilesetUrl").isString());

        mockMvc.perform(get("/api/observations/1/tileset/original"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tilesetUrl").isString());

        mockMvc.perform(get("/api/jobs/1"))
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
                        .param("observedAt", "2024-01-01"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void regeneratesVoxelWithDefaultOptions() throws Exception {
        createProject();
        uploadObservation("2024-01-01 observation", "2024-01-01");

        mockMvc.perform(post("/api/observations/1/voxelize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.voxelStatus").value("SUCCEEDED"))
                .andExpect(jsonPath("$.voxelJobId").value(2));
    }

    private void createProject() throws Exception {
        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"project\"}"))
                .andExpect(status().isCreated());
    }

    private void uploadObservation(String name, String observedAt) throws Exception {
        mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(zipFile())
                        .param("name", name)
                        .param("observedAt", observedAt))
                .andExpect(status().isOk());
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
