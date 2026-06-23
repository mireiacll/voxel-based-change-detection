package com.gaia3d.backend.project;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gaia3d.backend.diff.DiffItemRepository;
import com.gaia3d.backend.diff.DiffRepository;
import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobRepository;
import com.gaia3d.backend.job.JobStatus;
import com.gaia3d.backend.job.JobTargetType;
import com.gaia3d.backend.job.JobType;
import com.gaia3d.backend.observation.ObservationRepository;
import com.gaia3d.backend.voxelizer.VoxelizerProperties;

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
class ProjectControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ObservationRepository observationRepository;

    @Autowired
    private DiffRepository diffRepository;

    @Autowired
    private DiffItemRepository diffItemRepository;

    @Autowired
    private JobRepository jobRepository;

    @Autowired
    private VoxelizerProperties properties;

    @Test
    void createsListsUpdatesAndDeletesProject() throws Exception {
        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Asan landfill change detection",
                                  "description": "Time-series project",
                                  "centerLat": 36.123,
                                  "centerLon": 127.123,
                                  "cameraHeight": 1500
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/projects/1"))
                .andExpect(jsonPath("$.id").value(1))
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        mockMvc.perform(get("/api/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Asan landfill change detection"));

        mockMvc.perform(put("/api/projects/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Updated project",
                                  "description": "Updated",
                                  "centerLat": 36.2,
                                  "centerLon": 127.2,
                                  "cameraHeight": 1200,
                                  "status": "ARCHIVED"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Updated project"))
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        mockMvc.perform(delete("/api/projects/1"))
                .andExpect(status().isAccepted());

        waitForProjectDeletion(1);

        mockMvc.perform(get("/api/projects/1"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deletesProjectWithDiffsObservationsJobsAndFiles() throws Exception {
        createProject();

        long observationJob1 = uploadObservation(1, "2024-01", "2024-01-01");
        long observationJob2 = uploadObservation(2, "2024-02", "2024-02-01");
        long diffJobId = createDiff(1, 2);

        Path observationTilesDir = properties.visualizationTilesPath()
                .resolve("projects/1/observations/1/tileset")
                .toAbsolutePath()
                .normalize();
        Path observationVoxelDir = properties.voxelSetOutputPath()
                .resolve("projects/1/observations/1/voxel")
                .toAbsolutePath()
                .normalize();
        Path diffDir = properties.voxelSetOutputPath()
                .resolve("projects/1/diffs/1")
                .toAbsolutePath()
                .normalize();

        Assertions.assertTrue(Files.exists(observationTilesDir));
        Assertions.assertTrue(Files.exists(observationVoxelDir));
        Assertions.assertTrue(Files.exists(diffDir));

        mockMvc.perform(delete("/api/projects/1"))
                .andExpect(status().isAccepted());

        mockMvc.perform(get("/api/projects"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());

        mockMvc.perform(get("/api/projects/1"))
                .andExpect(status().isNotFound());

        waitForProjectDeletion(1);

        mockMvc.perform(get("/api/projects/1"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/observations/1"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/diffs/1"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/jobs/" + observationJob1))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/jobs/" + observationJob2))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/jobs/" + diffJobId))
                .andExpect(status().isNotFound());

        Assertions.assertEquals(0, projectRepository.count());
        Assertions.assertEquals(0, observationRepository.count());
        Assertions.assertEquals(0, diffRepository.count());
        Assertions.assertEquals(0, diffItemRepository.count());
        Assertions.assertTrue(jobRepository.findAll().stream()
                .anyMatch(job -> job.getTargetType() == JobTargetType.PROJECT
                        && job.getTargetId() == 1L
                        && job.getJobType() == JobType.PROJECT_DELETE
                        && job.getStatus() == JobStatus.SUCCEEDED));
        Assertions.assertFalse(Files.exists(observationTilesDir));
        Assertions.assertFalse(Files.exists(observationVoxelDir));
        Assertions.assertFalse(Files.exists(diffDir));
    }

    private void createProject() throws Exception {
        mockMvc.perform(post("/api/projects")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"project\"}"))
                .andExpect(status().isCreated());
    }

    private long uploadObservation(long expectedObservationId, String name, String observedAt) throws Exception {
        MvcResult result = mockMvc.perform(multipart("/api/projects/1/observations")
                        .file(zipFile())
                        .param("name", name)
                        .param("datasetType", "pointcloud")
                        .param("observedAt", observedAt))
                .andExpect(status().isAccepted())
                .andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        long jobId = json.path("voxelJobId").asLong();
        waitForObservationJob(expectedObservationId, jobId);
        return jobId;
    }

    private long createDiff(long sourceObservationId, long targetObservationId) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/projects/1/diffs/ab")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "2024-01 vs 2024-02",
                                  "sourceObservationId": %d,
                                  "targetObservationId": %d
                                }
                                """.formatted(sourceObservationId, targetObservationId)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        long jobId = json.path("jobId").asLong();
        waitForDiffJob(1, jobId);
        return jobId;
    }

    private void waitForObservationJob(long observationId, long jobId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            JsonNode observationJson = objectMapper.readTree(mockMvc.perform(get("/api/observations/" + observationId + "/voxel-status"))
                    .andExpect(status().isOk())
                    .andReturn()
                    .getResponse()
                    .getContentAsString());
            JsonNode jobJson = objectMapper.readTree(mockMvc.perform(get("/api/jobs/" + jobId))
                    .andExpect(status().isOk())
                    .andReturn()
                    .getResponse()
                    .getContentAsString());
            if ("SUCCEEDED".equals(observationJson.path("voxelStatus").asText())
                    && "SUCCEEDED".equals(jobJson.path("status").asText())) {
                return;
            }
            Thread.sleep(50);
        }
        Assertions.fail("Timed out waiting for observation job " + jobId);
    }

    private void waitForDiffJob(long diffId, long jobId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            JsonNode diffJson = objectMapper.readTree(mockMvc.perform(get("/api/diffs/" + diffId))
                    .andExpect(status().isOk())
                    .andReturn()
                    .getResponse()
                    .getContentAsString());
            JsonNode jobJson = objectMapper.readTree(mockMvc.perform(get("/api/jobs/" + jobId))
                    .andExpect(status().isOk())
                    .andReturn()
                    .getResponse()
                    .getContentAsString());
            if ("SUCCEEDED".equals(diffJson.path("status").asText())
                    && "SUCCEEDED".equals(jobJson.path("status").asText())) {
                return;
            }
            Thread.sleep(50);
        }
        Assertions.fail("Timed out waiting for diff job " + jobId);
    }

    private void waitForProjectDeletion(long projectId) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Job deletionJob = jobRepository.findByTargetTypeAndTargetIdOrderByCreatedAtAscIdAsc(JobTargetType.PROJECT, projectId)
                    .stream()
                    .filter(job -> job.getJobType() == JobType.PROJECT_DELETE)
                    .findFirst()
                    .orElse(null);
            if (deletionJob != null && deletionJob.getStatus() == JobStatus.SUCCEEDED
                    && projectRepository.findById(projectId).isEmpty()) {
                return;
            }
            Thread.sleep(50);
        }
        Assertions.fail("Timed out waiting for project deletion " + projectId);
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
