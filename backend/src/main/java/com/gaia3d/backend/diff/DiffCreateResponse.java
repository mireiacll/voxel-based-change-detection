package com.gaia3d.backend.diff;

public record DiffCreateResponse(
        Long id,
        Long projectId,
        String name,
        DiffType type,
        DiffStatus status,
        Long jobId,
        long itemCount) {

    public static DiffCreateResponse from(Diff diff, long itemCount) {
        return new DiffCreateResponse(
                diff.getId(),
                diff.getProjectId(),
                diff.getName(),
                diff.getType(),
                diff.getStatus(),
                diff.getJobId(),
                itemCount);
    }
}
