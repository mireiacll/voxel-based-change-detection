package com.gaia3d.backend.voxelizer;

import java.nio.file.Path;
import java.util.List;

import org.springframework.stereotype.Component;

@Component
public class VoxelizerDiffCommandBuilder {

    public List<String> buildDiffCommand(Path jarPath, Path inputA, Path inputB, Path outputPath) {
        return List.of(
                "java",
                "-jar", normalize(jarPath),
                "diff",
                "--sourceInput", normalize(inputA),
                "--targetInput", normalize(inputB),
                "--output", normalize(outputPath),
                "--maxLevel", "15",
                "--log", normalize(outputPath.resolve("mago-voxelizer.log")),
                "--diffOperation", "ADD_AND_REMOVE",
                "--visualize",
                "--diffNeighborMode", "6",
                "--minDiffFilterLevel", "12",
                "--minDiffNeighbors", "2",
                "--diffNeighborIterations", "4",
                "--minDiffClusterSize", "10",
                "--union",
                "--massSummary",
                "--cubeDataType", "BYTE",
                "--recursive");
    }

    private String normalize(Path path) {
        return path.toAbsolutePath().normalize().toString();
    }
}
