package com.gaia3d.backend.observation;

import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

@Component
public class ObservationDatasetTypeConverter implements Converter<String, ObservationDatasetType> {

    @Override
    public ObservationDatasetType convert(String source) {
        return ObservationDatasetType.from(source);
    }
}
