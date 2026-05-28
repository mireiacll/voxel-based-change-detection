package com.example.backend.sample;

import java.util.List;
import java.util.Map;

import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.SimpleJdbcInsert;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SampleService {

    private static final RowMapper<SampleResponse> SAMPLE_ROW_MAPPER = (rs, rowNum) -> new SampleResponse(
            rs.getLong("id"),
            rs.getString("name"),
            rs.getString("description")
    );

    private final JdbcTemplate jdbcTemplate;
    private final SimpleJdbcInsert sampleInsert;

    public SampleService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.sampleInsert = new SimpleJdbcInsert(jdbcTemplate)
                .withTableName("samples")
                .usingGeneratedKeyColumns("id");
    }

    public List<SampleResponse> findAll() {
        return jdbcTemplate.query(
                "SELECT id, name, description FROM samples ORDER BY id",
                SAMPLE_ROW_MAPPER
        );
    }

    public SampleResponse findById(Long id) {
        try {
            return jdbcTemplate.queryForObject(
                    "SELECT id, name, description FROM samples WHERE id = ?",
                    SAMPLE_ROW_MAPPER,
                    id
            );
        } catch (EmptyResultDataAccessException exception) {
            throw notFound(id);
        }
    }

    public SampleResponse create(SampleRequest request) {
        Number id = sampleInsert.executeAndReturnKey(Map.of(
                "name", request.name(),
                "description", request.description()
        ));
        return new SampleResponse(id.longValue(), request.name(), request.description());
    }

    public SampleResponse update(Long id, SampleRequest request) {
        int updatedRowCount = jdbcTemplate.update(
                "UPDATE samples SET name = ?, description = ? WHERE id = ?",
                request.name(),
                request.description(),
                id
        );
        if (updatedRowCount == 0) {
            throw notFound(id);
        }

        return new SampleResponse(id, request.name(), request.description());
    }

    public void delete(Long id) {
        int deletedRowCount = jdbcTemplate.update("DELETE FROM samples WHERE id = ?", id);
        if (deletedRowCount == 0) {
            throw notFound(id);
        }
    }

    private ResponseStatusException notFound(Long id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "sample not found: " + id);
    }
}
