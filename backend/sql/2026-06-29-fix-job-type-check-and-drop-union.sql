-- One-off PostgreSQL schema fixes.
-- ddl-auto: update does NOT amend existing CHECK constraints or drop removed columns,
-- so these must be applied manually once per environment.

-- 1) jobs.job_type CHECK constraint was generated before JobType.PROJECT_DELETE existed,
--    so inserting a PROJECT_DELETE job fails. Recreate it with all current enum values.
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN ('PROJECT_DELETE', 'VOXEL_CREATE', 'DIFF_CREATE'));

-- 2) The diff "union" option was removed from the entity. The column is nullable so it does
--    not break inserts, but drop it to keep the schema in sync. (Optional cleanup.)
ALTER TABLE diffs DROP COLUMN IF EXISTS union_enabled;
