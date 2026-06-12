package com.gaia3d.backend.config;

import com.gaia3d.backend.common.TilesetUrlResolver;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class StaticTilesResourceConfig implements WebMvcConfigurer {

    private final TilesetUrlResolver tilesetUrlResolver;

    public StaticTilesResourceConfig(TilesetUrlResolver tilesetUrlResolver) {
        this.tilesetUrlResolver = tilesetUrlResolver;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/files/3dtiles/**")
                .addResourceLocations(asResourceLocation(tilesetUrlResolver.visualizationTilesRoot()));
        registry.addResourceHandler("/files/voxelsets/**")
                .addResourceLocations(asResourceLocation(tilesetUrlResolver.voxelSetRoot()));
    }

    private String asResourceLocation(java.nio.file.Path path) {
        String resourceLocation = path.toUri().toString();
        return resourceLocation.endsWith("/") ? resourceLocation : resourceLocation + "/";
    }
}
