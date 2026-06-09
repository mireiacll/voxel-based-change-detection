package com.gaia3d.backend.voxelizer;

import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class VoxelizerStartupLogger {

    private static final Logger log = LoggerFactory.getLogger(VoxelizerStartupLogger.class);

    private final VoxelizerProperties properties;

    public VoxelizerStartupLogger(VoxelizerProperties properties) {
        this.properties = properties;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logVoxelizerPaths() {
        Path jarPath = normalize(properties.jarPath());
        Path tempPath = normalize(properties.tempPath());
        Path visualizationTilesPath = normalize(properties.visualizationTilesPath());
        Path voxelSetOutputPath = normalize(properties.voxelSetOutputPath());

        log.info("Voxelizer paths:");
        log.info("  jar-path: {} (exists: {})", jarPath, Files.isRegularFile(jarPath));
        log.info("  temp-path: {} (exists: {})", tempPath, Files.isDirectory(tempPath));
        log.info("  visualization-tiles-path: {} (exists: {})",
                visualizationTilesPath,
                Files.isDirectory(visualizationTilesPath));
        log.info("  voxel-set-output-path: {} (exists: {})",
                voxelSetOutputPath,
                Files.isDirectory(voxelSetOutputPath));

        try {
            Files.createDirectories(tempPath);
            Files.createDirectories(visualizationTilesPath);
            Files.createDirectories(voxelSetOutputPath);
        } catch (Exception e) {
            log.error("Failed to create directories for voxelizer paths", e);
        }
    }

    private Path normalize(Path path) {
        return path.toAbsolutePath().normalize();
    }
}
