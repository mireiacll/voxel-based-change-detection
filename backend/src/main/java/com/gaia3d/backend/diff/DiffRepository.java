package com.gaia3d.backend.diff;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DiffRepository extends JpaRepository<Diff, Long> {

    List<Diff> findByProjectIdOrderByCreatedAtDesc(Long projectId);
}
