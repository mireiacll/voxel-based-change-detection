package com.gaia3d.backend.job;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface JobRepository extends JpaRepository<Job, Long> {

    List<Job> findAllByOrderByCreatedAtAscIdAsc();

    List<Job> findByTargetTypeAndTargetIdOrderByCreatedAtAscIdAsc(JobTargetType targetType, Long targetId);
}
