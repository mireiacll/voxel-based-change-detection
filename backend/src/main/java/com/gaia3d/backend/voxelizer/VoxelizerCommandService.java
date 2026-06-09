package com.gaia3d.backend.voxelizer;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class VoxelizerCommandService {

    private final VoxelizerProperties properties;

    public VoxelizerCommandService(VoxelizerProperties properties) {
        this.properties = properties;
    }

    public String createVoxelCommand(
            Path inputTilesetDir,
            Path outputVoxelDir,
            int maxLevel,
            boolean visualize,
            String visualizeColor,
            String cubeDataType,
            boolean recursive) {
        return toDisplayCommand(createVoxelCommandArgs(
                inputTilesetDir,
                outputVoxelDir,
                maxLevel,
                visualize,
                visualizeColor,
                cubeDataType,
                recursive));
    }

    public List<String> createVoxelCommandArgs(
            Path inputTilesetDir,
            Path outputVoxelDir,
            int maxLevel,
            boolean visualize,
            String visualizeColor,
            String cubeDataType,
            boolean recursive) {
        List<String> command = new ArrayList<>(List.of(
                "java",
                "-jar",
                normalize(properties.jarPath()),
                "create",
                "--input",
                normalize(inputTilesetDir),
                "--output",
                normalize(outputVoxelDir),
                "--maxLevel",
                String.valueOf(maxLevel)));
        if (visualize) {
            command.add("--visualize");
            command.add("--visualizeColor");
            command.add(visualizeColor);
        }
        command.add("--cubeDataType");
        command.add(cubeDataType);
        if (recursive) {
            command.add("--recursive");
        }
        return command;
    }

    public String createDiffCommand(
            Path sourceVoxelDir,
            Path targetVoxelDir,
            Path outputDiffVoxelDir,
            int maxLevel,
            String diffOperation,
            boolean visualize,
            boolean interiorOnly,
            boolean massSummary,
            String cubeDataType,
            boolean recursive) {
        return toDisplayCommand(createDiffCommandArgs(
                sourceVoxelDir,
                targetVoxelDir,
                outputDiffVoxelDir,
                maxLevel,
                diffOperation,
                visualize,
                interiorOnly,
                massSummary,
                cubeDataType,
                recursive));
    }

    public List<String> createDiffCommandArgs(
            Path sourceVoxelDir,
            Path targetVoxelDir,
            Path outputDiffVoxelDir,
            int maxLevel,
            String diffOperation,
            boolean visualize,
            boolean interiorOnly,
            boolean massSummary,
            String cubeDataType,
            boolean recursive) {
        List<String> command = new ArrayList<>(List.of(
                "java",
                "-jar", normalize(properties.jarPath()), "diff",
                "--sourceInput", normalize(sourceVoxelDir),
                "--targetInput", normalize(targetVoxelDir),
                "--output", normalize(outputDiffVoxelDir),
                "--maxLevel", String.valueOf(maxLevel),
                "--diffOperation", diffOperation));
        if (visualize) {
            command.add("--visualize");
        }
        if (interiorOnly) {
            command.add("--interiorOnly");
        }
        if (massSummary) {
            command.add("--massSummary");
        }
        command.add("--cubeDataType");
        command.add(cubeDataType);
        if (recursive) {
            command.add("--recursive");
        }
        return command;
    }

    private String normalize(Path path) {
        return path.toAbsolutePath().normalize().toString();
    }

    public String toDisplayCommand(List<String> command) {
        return command.stream()
                .map(this::quoteIfNeeded)
                .reduce((left, right) -> left + " " + right)
                .orElse("");
    }

    private String quoteIfNeeded(String value) {
        if (value.contains(" ") || value.contains("\t")) {
            return "\"" + value.replace("\"", "\\\"") + "\"";
        }
        return value;
    }
}
