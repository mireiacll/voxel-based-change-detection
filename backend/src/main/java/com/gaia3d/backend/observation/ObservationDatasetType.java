package com.gaia3d.backend.observation;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ObservationDatasetType {
    POINTCLOUD("pointcloud"),
    MESH("mesh");

    private final String value;

    ObservationDatasetType(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    @JsonCreator
    public static ObservationDatasetType from(String value) {
        if (value == null) {
            return null;
        }
        for (ObservationDatasetType type : values()) {
            if (type.value.equalsIgnoreCase(value)) {
                return type;
            }
        }
        throw new IllegalArgumentException("unsupported datasetType: " + value);
    }
}
