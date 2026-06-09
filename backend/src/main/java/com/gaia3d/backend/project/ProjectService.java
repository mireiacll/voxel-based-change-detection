package com.gaia3d.backend.project;

import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProjectService {

    private final ProjectRepository projectRepository;

    public ProjectService(ProjectRepository projectRepository) {
        this.projectRepository = projectRepository;
    }

    public List<ProjectResponse> findAll() {
        return projectRepository.findAll(Sort.by(Sort.Direction.DESC, "createdAt")).stream()
                .map(ProjectResponse::from)
                .toList();
    }

    public Project getRequired(Long id) {
        return projectRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "project not found: " + id));
    }

    public ProjectResponse findById(Long id) {
        return ProjectResponse.from(getRequired(id));
    }

    public ProjectResponse create(ProjectRequest request) {
        return ProjectResponse.from(projectRepository.save(new Project(
                request.name(),
                request.description(),
                request.centerLat(),
                request.centerLon(),
                request.cameraHeight())));
    }

    public ProjectResponse update(Long id, ProjectRequest request) {
        Project project = getRequired(id);
        project.update(
                request.name(),
                request.description(),
                request.centerLat(),
                request.centerLon(),
                request.cameraHeight(),
                request.status());
        return ProjectResponse.from(projectRepository.save(project));
    }

    public void delete(Long id) {
        projectRepository.delete(getRequired(id));
    }
}
