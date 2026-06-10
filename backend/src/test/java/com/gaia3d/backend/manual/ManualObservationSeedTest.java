package com.gaia3d.backend.manual;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import com.gaia3d.backend.diff.CreateTimeSeriesDiffRequest;
import com.gaia3d.backend.diff.DiffCreateResponse;
import com.gaia3d.backend.diff.DiffDetailResponse;
import com.gaia3d.backend.diff.DiffItemResponse;
import com.gaia3d.backend.diff.DiffService;
import com.gaia3d.backend.diff.DiffStatus;
import com.gaia3d.backend.diff.DiffType;
import com.gaia3d.backend.observation.ObservationStatus;
import com.gaia3d.backend.observation.ObservationResponse;
import com.gaia3d.backend.observation.ObservationService;
import com.gaia3d.backend.project.ProjectRequest;
import com.gaia3d.backend.project.ProjectResponse;
import com.gaia3d.backend.project.ProjectService;
import com.gaia3d.backend.voxelizer.VoxelizerProperties;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
@EnabledIfSystemProperty(named = "manual.observation.seed", matches = "true")
class ManualObservationSeedTest {

    /*
     * Replace these paths with real 3D Tiles root directories.
     * Each directory must be under voxelizer.visualization-tiles-path and contain tileset.json at its root.
     */
    private static final List<SeedObservation> OBSERVATIONS = List.of(
            new SeedObservation("2025-11-06 observation", LocalDate.parse("2025-11-06"),
                    Path.of("H:/workspace/change-detection/3dtiles/dunpo-change-detection-251106-point-cloud")),
            new SeedObservation("2025-12-09 observation", LocalDate.parse("2025-12-09"),
                    Path.of("H:/workspace/change-detection/3dtiles/dunpo-change-detection-251209-point-cloud")),
            new SeedObservation("2026-02-09 observation", LocalDate.parse("2026-02-09"),
                    Path.of("H:/workspace/change-detection/3dtiles/dunpo-change-detection-260209-point-cloud")));

    @Autowired
    private ProjectService projectService;

    @Autowired
    private ObservationService observationService;

    @Autowired
    private DiffService diffService;

    @Autowired
    private VoxelizerProperties voxelizerProperties;

    @TempDir
    private Path tempDir;

    @Test
    void seedRealThreeObservationsIntoConfiguredDatabase() throws Exception {
        assumeTrue(Boolean.getBoolean("manual.observation.seed"),
                "Run with -Dmanual.observation.seed=true after setting real 3D Tiles paths in this test.");

        validateInputs();
        printConfiguredPaths();

        ProjectResponse project = projectService.create(new ProjectRequest(
                "Dunpo-Manual 3D Tiles observation seed",
                "Seeded from ManualObservationSeedTest",
                36.123,
                127.123,
                1500.0,
                null));

        List<ObservationResponse> seededObservations = new ArrayList<>();
        for (SeedObservation seed : OBSERVATIONS) {
            MockMultipartFile file = zipAsMultipart(seed.tilesetRoot());
            ObservationResponse observation = observationService.upload(
                    project.id(),
                    seed.name(),
                    seed.observedAt(),
                    file);

            assertThat(observation.projectId()).isEqualTo(project.id());
            assertThat(observation.originalTilesetUrl()).isNotBlank();
            assertThat(observation.voxelJobId()).isNotNull();
            assertThat(observation.voxelStatus()).isEqualTo(ObservationStatus.SUCCEEDED);
            assertThat(Path.of(observation.originalTilesPath()).toAbsolutePath().normalize())
                    .startsWith(voxelizerProperties.visualizationTilesPath().toAbsolutePath().normalize());
            assertThat(Path.of(observation.voxelPath()).toAbsolutePath().normalize())
                    .startsWith(voxelizerProperties.voxelSetOutputPath().toAbsolutePath().normalize());
            assertThat(observation.voxelPath()).contains("observations");
            assertThat(observation.voxelPath()).contains("voxel");

            System.out.printf(
                    "Seeded observation id=%d projectId=%d observedAt=%s original=%s voxelStatus=%s voxel=%s%n",
                    observation.id(),
                    observation.projectId(),
                    observation.observedAt(),
                    observation.originalTilesetUrl(),
                    observation.voxelStatus(),
                    observation.voxelTilesetUrl());
            seededObservations.add(observation);
        }

        assertThat(seededObservations).hasSize(3);

        DiffCreateResponse diff = diffService.createTimeSeries(project.id(), new CreateTimeSeriesDiffRequest(
                "Manual seed time-series diff",
                15,
                true,
                6,
                12,
                2,
                4,
                10,
                true,
                true,
                "BYTE",
                true,
                null,
                null));

        assertThat(diff.type()).isEqualTo(DiffType.TIME_SERIES);
        assertThat(diff.status()).isEqualTo(DiffStatus.SUCCEEDED);
        assertThat(diff.itemCount()).isEqualTo(2);

        DiffDetailResponse detail = diffService.findById(diff.id());
        assertThat(detail.items()).hasSize(2);
        for (DiffItemResponse item : detail.items()) {
            assertThat(item.status().name()).isEqualTo("SUCCEEDED");
            assertThat(item.command()).contains("--maxLevel 15");
            assertThat(item.command()).contains("--sourceInput");
            assertThat(item.command()).contains("--targetInput");
            assertThat(item.command()).contains("--log");
            assertThat(item.command()).contains("--filter-connectivity 6");
            assertThat(item.command()).contains("--filter-min-level 12");
            assertThat(item.command()).contains("--filter-min-neighbors 3");
            assertThat(item.command()).contains("--filter-neighbor-iterations 2");
            assertThat(item.command()).contains("--filter-min-cluster-size 20");
            assertThat(item.command()).contains("--withUnion");
            assertThat(item.command()).doesNotContain("--interiorOnly");
            assertThat(item.command()).doesNotContain("--fill-diff");
            assertThat(Path.of(item.resultVoxelPath()).toAbsolutePath().normalize())
                    .startsWith(voxelizerProperties.voxelSetOutputPath().toAbsolutePath().normalize());

            System.out.printf(
                    "Seeded diff item id=%d source=%s target=%s status=%s voxel=%s log=%s%n",
                    item.id(),
                    item.sourceObservedAt(),
                    item.targetObservedAt(),
                    item.status(),
                    item.resultVoxelPath(),
                    item.logPath());
        }

        System.out.printf("Seeded project id=%d name=%s%n", project.id(), project.name());
        System.out.printf("Seeded time-series diff id=%d itemCount=%d%n", diff.id(), diff.itemCount());
    }

    private void validateInputs() {
        assertThat(OBSERVATIONS).hasSize(3);
        Path configuredTilesRoot = voxelizerProperties.visualizationTilesPath().toAbsolutePath().normalize();
        for (SeedObservation observation : OBSERVATIONS) {
            Path root = observation.tilesetRoot().toAbsolutePath().normalize();
            assertThat(root)
                    .as("3D Tiles root directory must exist: %s", root)
                    .isDirectory();
            assertThat(root.resolve("tileset.json"))
                    .as("tileset.json must exist directly under: %s", root)
                    .isRegularFile();
            assertThat(root)
                    .as("Manual seed inputs should come from voxelizer.visualization-tiles-path: %s", configuredTilesRoot)
                    .startsWith(configuredTilesRoot);
        }
    }

    private void printConfiguredPaths() {
        System.out.printf("voxelizer.visualization-tiles-path=%s%n",
                voxelizerProperties.visualizationTilesPath().toAbsolutePath().normalize());
        System.out.printf("voxelizer.voxel-set-output-path=%s%n",
                voxelizerProperties.voxelSetOutputPath().toAbsolutePath().normalize());
        System.out.printf("voxelizer.storage-root=%s%n",
                voxelizerProperties.storageRoot().toAbsolutePath().normalize());
    }

    private MockMultipartFile zipAsMultipart(Path tilesetRoot) throws IOException {
        Path zipPath = tempDir.resolve(tilesetRoot.getFileName() + ".zip");
        byte[] zipBytes = zipDirectoryContents(tilesetRoot);
        Files.write(zipPath, zipBytes);
        return new MockMultipartFile(
                "file",
                zipPath.getFileName().toString(),
                "application/zip",
                zipBytes);
    }

    private byte[] zipDirectoryContents(Path sourceRoot) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zipOutputStream = new ZipOutputStream(output);
                var paths = Files.walk(sourceRoot)) {
            for (Path path : paths.filter(Files::isRegularFile).toList()) {
                Path relative = sourceRoot.relativize(path);
                ZipEntry entry = new ZipEntry(relative.toString().replace('\\', '/'));
                zipOutputStream.putNextEntry(entry);
                Files.copy(path, zipOutputStream);
                zipOutputStream.closeEntry();
            }
        }
        return output.toByteArray();
    }

    private record SeedObservation(String name, LocalDate observedAt, Path tilesetRoot) {
    }
}
