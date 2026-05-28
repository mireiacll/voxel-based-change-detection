MERGE INTO samples (id, name, description) KEY(id)
VALUES (1, 'sample-1', 'Initial sample resource');

ALTER TABLE samples ALTER COLUMN id RESTART WITH 2;
