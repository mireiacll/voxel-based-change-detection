package com.gaia3d.backend.observation;

import java.time.LocalDate;

import com.gaia3d.backend.common.BaseTimeEntity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "observations")
public class Observation extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long projectId;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false)
    private LocalDate observedAt;

    private String originalTilesPath;

    private String originalTilesetUrl;

    private String voxelPath;

    private String voxelTilesetUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ObservationStatus voxelStatus = ObservationStatus.NONE;

    private Long voxelJobId;

    protected Observation() {
    }

    public Observation(Long projectId, String name, LocalDate observedAt) {
        this.projectId = projectId;
        this.name = name;
        this.observedAt = observedAt;
    }

    public void update(String name, LocalDate observedAt) {
        this.name = name;
        this.observedAt = observedAt;
    }

    public void setOriginalTiles(String originalTilesPath, String originalTilesetUrl) {
        this.originalTilesPath = originalTilesPath;
        this.originalTilesetUrl = originalTilesetUrl;
    }

    public void queueVoxel(Long voxelJobId, String voxelPath) {
        this.voxelJobId = voxelJobId;
        this.voxelPath = voxelPath;
        this.voxelStatus = ObservationStatus.QUEUED;
        this.voxelTilesetUrl = null;
    }

    public void startVoxel() {
        this.voxelStatus = ObservationStatus.RUNNING;
    }

    public void succeedVoxel(String voxelTilesetUrl) {
        this.voxelStatus = ObservationStatus.SUCCEEDED;
        this.voxelTilesetUrl = voxelTilesetUrl;
    }

    public void failVoxel() {
        this.voxelStatus = ObservationStatus.FAILED;
    }

    public Long getId() { return id; }
    public Long getProjectId() { return projectId; }
    public String getName() { return name; }
    public LocalDate getObservedAt() { return observedAt; }
    public String getOriginalTilesPath() { return originalTilesPath; }
    public String getOriginalTilesetUrl() { return originalTilesetUrl; }
    public String getVoxelPath() { return voxelPath; }
    public String getVoxelTilesetUrl() { return voxelTilesetUrl; }
    public ObservationStatus getVoxelStatus() { return voxelStatus; }
    public Long getVoxelJobId() { return voxelJobId; }
}
