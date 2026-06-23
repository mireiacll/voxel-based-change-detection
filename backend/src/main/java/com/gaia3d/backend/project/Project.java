package com.gaia3d.backend.project;

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
@Table(name = "projects")
public class Project extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 1000)
    private String description;

    private Double centerLat;

    private Double centerLon;

    private Double cameraHeight;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private ProjectStatus status = ProjectStatus.ACTIVE;

    protected Project() {
    }

    public Project(String name, String description, Double centerLat, Double centerLon, Double cameraHeight) {
        this.name = name;
        this.description = description;
        this.centerLat = centerLat;
        this.centerLon = centerLon;
        this.cameraHeight = cameraHeight;
    }

    public void update(String name, String description, Double centerLat, Double centerLon, Double cameraHeight,
            ProjectStatus status) {
        this.name = name;
        this.description = description;
        this.centerLat = centerLat;
        this.centerLon = centerLon;
        this.cameraHeight = cameraHeight;
        this.status = status == null ? this.status : status;
    }

    public void markDeleting() {
        this.status = ProjectStatus.DELETING;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public Double getCenterLat() { return centerLat; }
    public Double getCenterLon() { return centerLon; }
    public Double getCameraHeight() { return cameraHeight; }
    public ProjectStatus getStatus() { return status; }
}
