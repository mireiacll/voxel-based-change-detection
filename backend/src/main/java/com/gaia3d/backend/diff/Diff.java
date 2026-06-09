package com.gaia3d.backend.diff;

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
@Table(name = "diffs")
public class Diff extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long projectId;

    @Column(nullable = false, length = 100)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private DiffType type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private DiffStatus status = DiffStatus.QUEUED;

    private Integer maxLevel;
    private Boolean visualize;
    private String visualizeColor;
    private Integer diffNeighborMode;
    private Integer minDiffFilterLevel;
    private Integer minDiffNeighbors;
    private Integer diffNeighborIterations;
    private Integer minDiffClusterSize;
    @Column(name = "union_enabled")
    private Boolean union;
    private Boolean massSummary;
    private String cubeDataType;
    private Boolean recursive;
    private Double filterThreshold;

    @Column(length = 4000)
    private String areaWkt;

    private Long jobId;

    protected Diff() {
    }

    public Diff(Long projectId, String name, DiffType type, DiffOptions options) {
        this.projectId = projectId;
        this.name = name;
        this.type = type;
        applyOptions(options);
    }

    public void applyOptions(DiffOptions options) {
        this.maxLevel = options.maxLevel();
        this.visualize = options.visualize();
        this.visualizeColor = options.visualizeColor();
        this.diffNeighborMode = options.diffNeighborMode();
        this.minDiffFilterLevel = options.minDiffFilterLevel();
        this.minDiffNeighbors = options.minDiffNeighbors();
        this.diffNeighborIterations = options.diffNeighborIterations();
        this.minDiffClusterSize = options.minDiffClusterSize();
        this.union = options.union();
        this.massSummary = options.massSummary();
        this.cubeDataType = options.cubeDataType();
        this.recursive = options.recursive();
        this.filterThreshold = options.filterThreshold();
        this.areaWkt = options.areaWkt();
    }

    public void attachJob(Long jobId) {
        this.jobId = jobId;
    }

    public void start() {
        this.status = DiffStatus.RUNNING;
    }

    public void finish(DiffStatus status) {
        this.status = status;
    }

    public Long getId() { return id; }
    public Long getProjectId() { return projectId; }
    public String getName() { return name; }
    public DiffType getType() { return type; }
    public DiffStatus getStatus() { return status; }
    public Integer getMaxLevel() { return maxLevel; }
    public Boolean getVisualize() { return visualize; }
    public String getVisualizeColor() { return visualizeColor; }
    public Integer getDiffNeighborMode() { return diffNeighborMode; }
    public Integer getMinDiffFilterLevel() { return minDiffFilterLevel; }
    public Integer getMinDiffNeighbors() { return minDiffNeighbors; }
    public Integer getDiffNeighborIterations() { return diffNeighborIterations; }
    public Integer getMinDiffClusterSize() { return minDiffClusterSize; }
    public Boolean getUnion() { return union; }
    public Boolean getMassSummary() { return massSummary; }
    public String getCubeDataType() { return cubeDataType; }
    public Boolean getRecursive() { return recursive; }
    public Double getFilterThreshold() { return filterThreshold; }
    public String getAreaWkt() { return areaWkt; }
    public Long getJobId() { return jobId; }
}
