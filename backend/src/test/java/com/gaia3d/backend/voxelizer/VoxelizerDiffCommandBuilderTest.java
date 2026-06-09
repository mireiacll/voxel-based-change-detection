package com.gaia3d.backend.voxelizer;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VoxelizerDiffCommandBuilderTest {

    private final VoxelizerDiffCommandBuilder commandBuilder = new VoxelizerDiffCommandBuilder();

    @Test
    void buildsDiffCommand() throws Exception {
        Path jarPath = Path.of("C:/Workspace/git-repositories/geo-data-cube/mago-voxelizer/dist/mago-voxelizer-0.1.0-beta.jar");
        Path inputA = Path.of("H:\\workspace\\mago-voxelizer\\output\\둔포면 복셀\\dunpo17-change-detection-251209-point-cloud");
        Path inputB = Path.of("H:\\workspace\\mago-voxelizer\\output\\둔포면 복셀\\dunpo17-change-detection-260209-point-cloud");
        Path outputPath = Path.of("H:\\workspace\\mago-voxelizer\\output\\VBCD-TEST");

        List<String> command = commandBuilder.buildDiffCommand(jarPath, inputA, inputB, outputPath);

        assertThat(command).containsExactly(
                "java",
                "-jar",
                normalize(jarPath),
                "diff",
                "--input",
                normalize(inputA),
                "--input",
                normalize(inputB),
                "--output",
                normalize(outputPath),
                "--maxLevel",
                "15",
                "--diffOperation",
                "CHANGED",
                "--visualize",
                "--visualizeType",
                "POINT",
                "--visualizeColor",
                "orange",
                "--interiorOnly",
                "--minInteriorThickness",
                "3",
                "--massSummary",
                "--cubeDataType",
                "BYTE",
                "--recursive");
    }

    @Test
    void runsVoxelizerDiffWhenLocalInputsExist(@TempDir Path tempDir) throws Exception {
        Path jarPath = pathFromEnv("VOXELIZER_JAR_PATH");
        Path inputA = pathFromEnv("VOXELIZER_DIFF_INPUT_A");
        Path inputB = pathFromEnv("VOXELIZER_DIFF_INPUT_B");
        Path outputPath = tempDir.resolve("new-compare");

        assumeTrue(Files.isRegularFile(jarPath), "VOXELIZER_JAR_PATH must point to voxelizer.jar");
        assumeTrue(Files.isDirectory(inputA), "VOXELIZER_DIFF_INPUT_A must point to a voxelset directory");
        assumeTrue(Files.isDirectory(inputB), "VOXELIZER_DIFF_INPUT_B must point to a voxelset directory");

        runVoxelizerDiff(commandBuilder.buildDiffCommand(jarPath, inputA, inputB, outputPath), outputPath);
    }

    private void runVoxelizerDiff(List<String> command, Path outputPath) throws Exception {
        System.out.println("[voxelizer-test] command:");
        System.out.println(String.join(" ", command));
        System.out.println("[voxelizer-test] output path: " + outputPath.toAbsolutePath().normalize());

        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(true);

        Process process = processBuilder.start();
        String output;
        try (var reader = process.inputReader()) {
            output = reader.lines()
                    .peek(line -> System.out.println("[voxelizer] " + line))
                    .collect(Collectors.joining(System.lineSeparator()));
        }

        int exitCode = process.waitFor();

        System.out.println("[voxelizer-test] exit code: " + exitCode);

        assertThat(exitCode)
                .as(output)
                .isEqualTo(0);
        assertThat(outputPath).isDirectory();
    }

    private Path pathFromEnv(String name) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? Path.of("") : Path.of(value);
    }

    private String normalize(Path path) {
        return path.toAbsolutePath().normalize().toString();
    }
}
