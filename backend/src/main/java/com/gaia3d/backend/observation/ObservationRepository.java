package com.gaia3d.backend.observation;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ObservationRepository extends JpaRepository<Observation, Long> {

    List<Observation> findByProjectIdOrderByObservedAtAsc(Long projectId);
}
