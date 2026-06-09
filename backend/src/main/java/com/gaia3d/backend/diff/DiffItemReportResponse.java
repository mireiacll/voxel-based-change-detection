package com.gaia3d.backend.diff;

import java.time.LocalDate;

public record DiffItemReportResponse(
        Long diffItemId,
        LocalDate sourceObservedAt,
        LocalDate targetObservedAt,
        Double addedVolume,
        Double removedVolume,
        Double changedVolume,
        String summaryPath) {

    public static DiffItemReportResponse from(DiffItem item) {
        return new DiffItemReportResponse(
                item.getId(),
                item.getSourceObservedAt(),
                item.getTargetObservedAt(),
                item.getAddedVolume(),
                item.getRemovedVolume(),
                item.getChangedVolume(),
                item.getSummaryPath());
    }
}
