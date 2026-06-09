package com.gaia3d.backend.diff;

public enum DiffStatus {
    QUEUED,
    RUNNING,
    SUCCEEDED,
    FAILED,
    PARTIAL_FAILED,
    CANCELLED
}
