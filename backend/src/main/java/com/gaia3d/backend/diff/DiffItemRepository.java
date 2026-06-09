package com.gaia3d.backend.diff;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DiffItemRepository extends JpaRepository<DiffItem, Long> {

    List<DiffItem> findByDiffIdOrderBySourceObservedAtAsc(Long diffId);

    long countByDiffId(Long diffId);

    void deleteByDiffId(Long diffId);
}
