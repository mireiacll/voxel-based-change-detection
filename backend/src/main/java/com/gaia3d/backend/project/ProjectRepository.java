package com.gaia3d.backend.project;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, Long> {

    List<Project> findByStatusNotOrderByCreatedAtDesc(ProjectStatus status);
}
