package com.gaia3d.backend.sample;

import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SampleService {

    private final SampleRepository sampleRepository;

    public SampleService(SampleRepository sampleRepository) {
        this.sampleRepository = sampleRepository;
    }

    public List<SampleResponse> findAll() {
        return sampleRepository.findAll(Sort.by(Sort.Direction.ASC, "id")).stream()
                .map(this::toResponse)
                .toList();
    }

    public SampleResponse findById(Long id) {
        return toResponse(getRequired(id));
    }

    public SampleResponse create(SampleRequest request) {
        Sample created = sampleRepository.save(new Sample(request.name(), request.description()));
        return toResponse(created);
    }

    public SampleResponse update(Long id, SampleRequest request) {
        Sample sample = getRequired(id);
        sample.update(request.name(), request.description());
        return toResponse(sampleRepository.save(sample));
    }

    public void delete(Long id) {
        sampleRepository.delete(getRequired(id));
    }

    private Sample getRequired(Long id) {
        return sampleRepository.findById(id)
                .orElseThrow(() -> notFound(id));
    }

    private SampleResponse toResponse(Sample sample) {
        return new SampleResponse(sample.getId(), sample.getName(), sample.getDescription());
    }

    private ResponseStatusException notFound(Long id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "sample not found: " + id);
    }
}
