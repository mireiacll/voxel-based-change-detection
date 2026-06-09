# Backend API

This backend can be run with Docker Compose so frontend developers can test the API without knowing Spring Boot or Gradle.

## 1. Frontend Smoke Test Mode

Use this mode for normal frontend API testing. It starts:

- Spring Boot API server
- PostgreSQL/PostGIS database
- Mock voxelizer execution

Run from the repository root:

```powershell
docker compose -f backend\docker-compose.yml up -d --build
```

Check containers:

```powershell
docker compose -f backend\docker-compose.yml ps
```

Follow backend logs:

```powershell
docker compose -f backend\docker-compose.yml logs -f vbcd-backend
```

Stop:

```powershell
docker compose -f backend\docker-compose.yml down
```

Reset DB and uploaded files:

```powershell
docker compose -f backend\docker-compose.yml down -v
```

## 2. Open Swagger

Open this URL in a browser:

```text
http://localhost:8080/swagger-ui/index.html
```

Frontend developers should use Swagger `Try it out` to test APIs.

OpenAPI JSON:

```text
http://localhost:8080/v3/api-docs
```

## 3. First API Checks

In Swagger, test:

```text
GET /api/health
```

Expected:

```json
{"status":"ok"}
```

Then test:

```text
GET /api/projects
```

On first startup the backend seeds one empty sample project:

```json
[
  {
    "id": 1,
    "name": "Sample Change Detection Project",
    "description": "Frontend smoke-test project. Upload observations to this project first.",
    "centerLat": 36.123,
    "centerLon": 127.123,
    "cameraHeight": 1500,
    "status": "ACTIVE"
  }
]
```

Then test:

```text
GET /api/projects/1/observations
```

Expected before upload:

```json
[]
```

## 4. Upload 3D Tiles In Swagger

Use:

```text
POST /api/projects/{projectId}/observations
```

Input:

- `projectId`: `1`
- `name`: `2024-01-01 observation`
- `observedAt`: `2024-01-01`
- `file`: 3D Tiles zip file

The zip file must contain `tileset.json` at the zip root.

Default Docker Compose uses:

```text
VOXELIZER_MOCK_EXECUTION=true
```

So uploads create DB records, folders, jobs, and command strings without requiring the real voxelizer jar.

After upload, check:

```text
GET /api/projects/1/observations
GET /api/jobs/{jobId}
GET /api/observations/{observationId}/tileset/original
GET /api/observations/{observationId}/tileset/voxel
```

## 5. Diff Test Flow

Upload at least two observations with different `observedAt` values.

A/B diff:

```text
POST /api/projects/{projectId}/diffs/ab
```

Example body:

```json
{
  "name": "2024-01 vs 2024-02",
  "sourceObservationId": 1,
  "targetObservationId": 2,
  "maxLevel": 15,
  "visualize": true,
  "diffNeighborMode": 6,
  "minDiffFilterLevel": 12,
  "minDiffNeighbors": 2,
  "diffNeighborIterations": 4,
  "minDiffClusterSize": 10,
  "union": true,
  "massSummary": true,
  "cubeDataType": "BYTE",
  "recursive": true
}
```

Time-series diff:

```text
POST /api/projects/{projectId}/diffs/time-series
```

Example body:

```json
{
  "name": "Full time-series diff",
  "maxLevel": 15,
  "visualize": true,
  "diffNeighborMode": 6,
  "minDiffFilterLevel": 12,
  "minDiffNeighbors": 2,
  "diffNeighborIterations": 4,
  "minDiffClusterSize": 10,
  "union": true,
  "massSummary": true,
  "cubeDataType": "BYTE",
  "recursive": true
}
```

Check results:

```text
GET /api/projects/1/diffs
GET /api/diffs/{diffId}
GET /api/diffs/{diffId}/items
GET /api/diff-items/{diffItemId}/tileset
GET /api/diff-items/{diffItemId}/report
```

## 6. Real Local Voxelizer Test Mode

Use this when you want Docker to use real local folders and the real voxelizer jar.

Before running, edit:

```text
backend/docker-compose.local.yml
```

Change only the left side of these volume mappings to match your PC:

```yaml
volumes:
  - H:/workspace/change-detection:/data
  - C:/path/to/mago-voxelizer.jar:/app/mago-voxelizer.jar:ro
```

Keep the container paths `/data` and `/app/mago-voxelizer.jar`.

Run:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  up -d --build
```

This override sets:

```text
VOXELIZER_MOCK_EXECUTION=false
VOXELIZER_STORAGE_ROOT=/data
VOXELIZER_VISUALIZATION_TILES_PATH=/data/3dtiles
VOXELIZER_VOXEL_SET_OUTPUT_PATH=/data/voxelsets
VOXELIZER_JAR_PATH=/app/mago-voxelizer.jar
```

Host paths are visible like this:

```text
H:/workspace/change-detection/3dtiles
H:/workspace/change-detection/voxelsets
H:/workspace/change-detection/jobs
```

Logs:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  logs -f vbcd-backend
```

Process log files:

```text
H:/workspace/change-detection/jobs/{jobId}/process.log
H:/workspace/change-detection/voxelsets/projects/{projectId}/diffs/{diffId}/items/{diffItemId}/process.log
```

## 7. Deployment Compose

Deployment compose is separate:

```text
backend/docker-compose.prod.yml
```

It does not build from source. It expects a backend image.

Build and tag an image locally:

```powershell
docker build -t vbcd-backend:latest backend
```

Run deployment compose:

```powershell
docker compose -f backend\docker-compose.prod.yml up -d
```

Recommended production environment variables:

```powershell
$env:VBCD_BACKEND_IMAGE="vbcd-backend:latest"
$env:VBCD_DATA_DIR="D:/vbcd/data"
$env:VBCD_DB_DIR="D:/vbcd/postgis-data"
$env:VOXELIZER_HOST_JAR="D:/vbcd/mago-voxelizer.jar"
$env:VOXELIZER_MOCK_EXECUTION="false"
$env:DB_PASSWORD="change-me"
```

Then run:

```powershell
docker compose -f backend\docker-compose.prod.yml up -d
```

Deployment paths:

```text
VBCD_DATA_DIR -> /data
VOXELIZER_HOST_JAR -> /app/mago-voxelizer.jar
VBCD_DB_DIR -> /var/lib/postgresql/data
```

## 8. Docker Compose Defaults

Development compose:

```text
backend/docker-compose.yml
```

Services:

- `vbcd-backend`: Spring Boot API server
- `postgis`: PostgreSQL/PostGIS database

API:

```text
http://localhost:8080
```

DB from host:

- host: `localhost`
- port: `5432`
- database: `voxel_change_detection`
- username: `voxel`
- password: `voxel`

DB from container:

```text
postgis:5432
```

## 9. Developer Commands

Run Spring tests:

```powershell
cd backend
.\gradlew.bat test
```

Generate OpenAPI JSON file:

```powershell
cd backend
.\gradlew.bat generateApiDocs
```

Generated file:

```text
backend/build/docs/api/openapi.json
```
