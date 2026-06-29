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
                "--maxLevel", "16",
                "--log", normalize(outputPath.resolve("log.txt")),
                "--diffOperation", "ADD_AND_REMOVE",
                "--visualize",
                "--filter-connectivity", "6",
                "--filter-min-level", "12",
                "--filter-min-neighbors", "3",
                "--filter-neighbor-iterations", "2",
                "--filter-min-cluster-size", "20",
                "--massSummary",
                "--cubeDataType", "BYTE",
                "--recursive");
    }

    private String normalize(Path path) {
        return path.toAbsolutePath().normalize().toString();
    }
}
