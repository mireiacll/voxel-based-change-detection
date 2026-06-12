package com.gaia3d.backend.common;

import java.nio.file.Path;

import com.gaia3d.backend.voxelizer.VoxelizerProperties;

import org.springframework.stereotype.Component;

@Component
public class TilesetUrlResolver {

    private static final String VISUALIZATION_PREFIX = "/files/3dtiles";
    private static final String VOXEL_PREFIX = "/files/voxelsets";

    private final Path visualizationTilesRoot;
    private final Path voxelSetRoot;

    public TilesetUrlResolver(VoxelizerProperties properties) {
        this.visualizationTilesRoot = normalize(properties.visualizationTilesPath());
        this.voxelSetRoot = normalize(properties.voxelSetOutputPath());
    }

    public String visualizationTilesetUrl(Path directory) {
        return tilesetUrl(directory, visualizationTilesRoot, VISUALIZATION_PREFIX);
    }

    public String voxelTilesetUrl(Path directory) {
        return tilesetUrl(directory, voxelSetRoot, VOXEL_PREFIX);
    }

    public Path visualizationTilesRoot() {
        return visualizationTilesRoot;
    }

    public Path voxelSetRoot() {
        return voxelSetRoot;
    }

    private String tilesetUrl(Path directory, Path root, String prefix) {
        Path normalizedDirectory = normalize(directory);
        if (!normalizedDirectory.startsWith(root)) {
            throw new IllegalArgumentException("tileset directory is outside configured root: " + normalizedDirectory);
        }
        String relative = root.relativize(normalizedDirectory.resolve("tileset.json")).toString().replace('\\', '/');
        return prefix + "/" + relative;
    }

    private Path normalize(Path path) {
        return path.toAbsolutePath().normalize();
    }
}
