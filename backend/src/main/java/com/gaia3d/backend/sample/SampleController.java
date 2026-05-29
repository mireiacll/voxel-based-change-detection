package com.gaia3d.backend.sample;

import java.net.URI;
import java.util.List;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Sample", description = "Sample CRUD endpoints for a REST API")
@RestController
@RequestMapping("/api/samples")
public class SampleController {

    private final SampleService sampleService;

    public SampleController(SampleService sampleService) {
        this.sampleService = sampleService;
    }

    @Operation(summary = "List samples", description = "Returns all sample resources.")
    @ApiResponse(responseCode = "200", description = "Sample list returned successfully")
    @GetMapping
    public List<SampleResponse> getSamples() {
        return sampleService.findAll();
    }

    @Operation(summary = "Get sample", description = "Returns a sample resource by id.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Sample returned successfully"),
            @ApiResponse(responseCode = "404", description = "Sample not found", content = @Content)
    })
    @GetMapping("/{id}")
    public SampleResponse getSample(@PathVariable Long id) {
        return sampleService.findById(id);
    }

    @Operation(summary = "Create sample", description = "Creates a sample resource.")
    @ApiResponses({
            @ApiResponse(responseCode = "201", description = "Sample created successfully",
                    content = @Content(schema = @Schema(implementation = SampleResponse.class))),
            @ApiResponse(responseCode = "400", description = "Invalid request", content = @Content)
    })
    @PostMapping
    public ResponseEntity<SampleResponse> createSample(@Valid @RequestBody SampleRequest request) {
        SampleResponse created = sampleService.create(request);
        return ResponseEntity
                .created(URI.create("/api/samples/" + created.id()))
                .body(created);
    }

    @Operation(summary = "Update sample", description = "Updates an existing sample resource.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Sample updated successfully"),
            @ApiResponse(responseCode = "400", description = "Invalid request", content = @Content),
            @ApiResponse(responseCode = "404", description = "Sample not found", content = @Content)
    })
    @PutMapping("/{id}")
    public SampleResponse updateSample(@PathVariable Long id, @Valid @RequestBody SampleRequest request) {
        return sampleService.update(id, request);
    }

    @Operation(summary = "Delete sample", description = "Deletes an existing sample resource.")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Sample deleted successfully", content = @Content),
            @ApiResponse(responseCode = "404", description = "Sample not found", content = @Content)
    })
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteSample(@PathVariable Long id) {
        sampleService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
