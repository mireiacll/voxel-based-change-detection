package com.gaia3d.backend.diff;

import java.util.List;

import com.gaia3d.backend.common.TilesetUrlResponse;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DiffController {

    private final DiffService diffService;

    public DiffController(DiffService diffService) {
        this.diffService = diffService;
    }

    @GetMapping("/api/projects/{projectId}/diffs")
    public List<DiffListResponse> list(
            @PathVariable Long projectId,
            @RequestParam(required = false) DiffType type,
            @RequestParam(required = false) DiffStatus status) {
        return diffService.findByProject(projectId, type, status);
    }

    @PostMapping("/api/projects/{projectId}/diffs/ab")
    public DiffCreateResponse createAb(
            @PathVariable Long projectId,
            @Valid @RequestBody CreateAbDiffRequest request) {
        return diffService.createAb(projectId, request);
    }

    @PostMapping("/api/projects/{projectId}/diffs/time-series")
    public DiffCreateResponse createTimeSeries(
            @PathVariable Long projectId,
            @Valid @RequestBody CreateTimeSeriesDiffRequest request) {
        return diffService.createTimeSeries(projectId, request);
    }

    @GetMapping("/api/diffs/{diffId}")
    public DiffDetailResponse get(@PathVariable Long diffId) {
        return diffService.findById(diffId);
    }

    @DeleteMapping("/api/diffs/{diffId}")
    public ResponseEntity<Void> delete(@PathVariable Long diffId) {
        diffService.delete(diffId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/diffs/{diffId}/cancel")
    public DiffDetailResponse cancel(@PathVariable Long diffId) {
        return diffService.cancel(diffId);
    }

    @GetMapping("/api/diffs/{diffId}/items")
    public List<DiffItemResponse> items(@PathVariable Long diffId) {
        return diffService.findItems(diffId);
    }

    @GetMapping("/api/diff-items/{diffItemId}")
    public DiffItemResponse item(@PathVariable Long diffItemId) {
        return diffService.findItem(diffItemId);
    }

    @GetMapping("/api/diff-items/{diffItemId}/tileset")
    public TilesetUrlResponse itemTileset(@PathVariable Long diffItemId) {
        return diffService.itemTileset(diffItemId);
    }

    @GetMapping("/api/diff-items/{diffItemId}/report")
    public DiffItemReportResponse itemReport(@PathVariable Long diffItemId) {
        return diffService.itemReport(diffItemId);
    }
}
