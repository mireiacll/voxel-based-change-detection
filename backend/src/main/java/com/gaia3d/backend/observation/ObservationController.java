package com.gaia3d.backend.observation;

import java.time.LocalDate;
import java.util.List;

import com.gaia3d.backend.common.TilesetUrlResponse;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Validated
@RestController
public class ObservationController {

    private final ObservationService observationService;

    public ObservationController(ObservationService observationService) {
        this.observationService = observationService;
    }

    @GetMapping("/api/projects/{projectId}/observations")
    public List<ObservationResponse> list(@PathVariable Long projectId) {
        return observationService.findByProject(projectId);
    }

    @PostMapping(value = "/api/projects/{projectId}/observations", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ObservationResponse> upload(
            @PathVariable Long projectId,
            @RequestParam @NotBlank String name,
            @RequestParam @NotNull @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate observedAt,
            @RequestParam @NotNull ObservationDatasetType datasetType,
            @RequestParam MultipartFile file) {
        return ResponseEntity.accepted().body(observationService.upload(projectId, name, observedAt, datasetType, file));
    }

    @GetMapping("/api/observations/{observationId}")
    public ObservationResponse get(@PathVariable Long observationId) {
        return observationService.findById(observationId);
    }

    @PutMapping("/api/observations/{observationId}")
    public ObservationResponse update(
            @PathVariable Long observationId,
            @Valid @RequestBody ObservationUpdateRequest request) {
        return observationService.update(observationId, request);
    }

    @DeleteMapping("/api/observations/{observationId}")
    public ResponseEntity<Void> delete(@PathVariable Long observationId) {
        observationService.delete(observationId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/observations/{observationId}/tileset/original")
    public TilesetUrlResponse originalTileset(@PathVariable Long observationId) {
        return observationService.originalTileset(observationId);
    }

    @GetMapping("/api/observations/{observationId}/tileset/voxel")
    public TilesetUrlResponse voxelTileset(@PathVariable Long observationId) {
        return observationService.voxelTileset(observationId);
    }

    @GetMapping("/api/observations/{observationId}/voxel-status")
    public ObservationVoxelStatusResponse voxelStatus(@PathVariable Long observationId) {
        return observationService.voxelStatus(observationId);
    }

    @PostMapping("/api/observations/{observationId}/voxelize")
    public ResponseEntity<ObservationResponse> voxelize(
            @PathVariable Long observationId,
            @RequestBody(required = false) VoxelizeRequest request) {
        VoxelizeRequest safeRequest = request == null ? new VoxelizeRequest(null, null, null, null, null) : request;
        return ResponseEntity.accepted().body(observationService.voxelize(observationId, safeRequest));
    }
}
