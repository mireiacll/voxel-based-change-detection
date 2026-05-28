INSERT INTO samples (id, name, description, location)
VALUES (
    1,
    'sample-1',
    'Initial sample resource',
    ST_GeomFromText('POINT(127.0276 37.4979)', 4326)
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE samples ALTER COLUMN id RESTART WITH 2;
