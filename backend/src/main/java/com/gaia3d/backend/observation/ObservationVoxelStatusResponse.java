package com.gaia3d.backend.observation;

import com.gaia3d.backend.job.Job;
import com.gaia3d.backend.job.JobStatus;

public record ObservationVoxelStatusResponse(
        Long observationId,
        ObservationStatus voxelStatus,
        Long voxelJobId,
        JobStatus jobStatus,
        Integer jobProgress,
        String jobMessage,
        String voxelTilesetUrl) {

    public static ObservationVoxelStatusResponse from(Observation observation, Job job) {
        return new ObservationVoxelStatusResponse(
                observation.getId(),
                observation.getVoxelStatus(),
                observation.getVoxelJobId(),
                job == null ? null : job.getStatus(),
                job == null ? null : job.getProgress(),
                job == null ? null : job.getMessage(),
                observation.getVoxelTilesetUrl());
    }
}
