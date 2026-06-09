# Backend API

프론트엔드 개발자가 Spring/Gradle을 몰라도 API를 테스트할 수 있도록 Docker Compose 기준으로 실행합니다.

## 1. 실행

레포지토리 루트에서 실행하세요.

```powershell
docker compose -f backend\docker-compose.yml up -d --build
```

컨테이너 상태 확인:

```powershell
docker compose -f backend\docker-compose.yml ps
```

정상이라면 아래 2개가 떠야 합니다.

```text
backend-api
backend-postgis
```

로그 확인:

```powershell
docker compose -f backend\docker-compose.yml logs -f backend
```

중지:

```powershell
docker compose -f backend\docker-compose.yml down
```

DB와 업로드/voxel 결과 볼륨까지 지우고 초기화:

```powershell
docker compose -f backend\docker-compose.yml down -v
```

## 2. Swagger로 API 보기

브라우저에서 Swagger UI를 여세요.

```text
http://localhost:8080/swagger-ui/index.html
```

OpenAPI JSON:

```text
http://localhost:8080/v3/api-docs
```

프론트엔드 개발자는 Swagger UI에서 직접 `Try it out`으로 API를 호출하면 됩니다.

## 3. 바로 확인할 API

헬스 체크:

```text
GET /api/health
```

프로젝트 목록:

```text
GET /api/projects
```

처음 실행하면 기본 프로젝트가 1개 생성됩니다.

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

Observation 목록:

```text
GET /api/projects/1/observations
```

처음에는 빈 배열입니다.

```json
[]
```

## 4. Swagger에서 3D Tiles 업로드 테스트

Swagger UI에서 아래 API를 선택하세요.

```text
POST /api/projects/{projectId}/observations
```

입력값:

- `projectId`: `1`
- `name`: `2024-01-01 observation`
- `observedAt`: `2024-01-01`
- `file`: 3D Tiles zip 파일

주의:

- zip 파일 루트에 `tileset.json`이 있어야 합니다.
- Docker Compose 기본 설정은 `VOXELIZER_MOCK_EXECUTION=true`입니다.
- 그래서 실제 voxelizer jar 없이도 업로드, Job 생성, 경로 생성, 상태 변경을 테스트할 수 있습니다.

업로드 후 확인:

```text
GET /api/projects/1/observations
GET /api/jobs/{jobId}
GET /api/observations/{observationId}/tileset/original
GET /api/observations/{observationId}/tileset/voxel
```

## 5. Diff API 테스트 순서

Observation을 날짜가 다른 2개 이상 업로드한 뒤 테스트하세요.

A/B Diff:

```text
POST /api/projects/{projectId}/diffs/ab
```

예시 JSON:

```json
{
  "name": "2024-01 vs 2024-02",
  "sourceObservationId": 1,
  "targetObservationId": 2,
  "maxLevel": 17,
  "visualize": true,
  "interiorOnly": true,
  "massSummary": true,
  "cubeDataType": "BYTE",
  "recursive": true
}
```

Time-Series Diff:

```text
POST /api/projects/{projectId}/diffs/time-series
```

예시 JSON:

```json
{
  "name": "Full time-series diff",
  "maxLevel": 17,
  "visualize": true,
  "interiorOnly": true,
  "massSummary": true,
  "cubeDataType": "BYTE",
  "recursive": true
}
```

결과 확인:

```text
GET /api/projects/1/diffs
GET /api/diffs/{diffId}
GET /api/diffs/{diffId}/items
GET /api/diff-items/{diffItemId}/tileset
GET /api/diff-items/{diffItemId}/report
```

## 6. Docker Compose 기본 설정

`backend/docker-compose.yml`은 아래 서비스를 실행합니다.

- `backend`: Spring Boot API 서버
- `postgis`: PostgreSQL/PostGIS DB

API 서버:

```text
http://localhost:8080
```

DB:

- host: `localhost`
- port: `5432`
- database: `voxel_change_detection`
- username: `voxel`
- password: `voxel`

Docker 내부에서 backend는 `postgis:5432`로 DB에 연결합니다.

## 7. 저장 경로

Docker Compose 기본값:

```yaml
VOXELIZER_STORAGE_ROOT: /data
VOXELIZER_VISUALIZATION_TILES_PATH: /data/3dtiles
VOXELIZER_VOXEL_SET_OUTPUT_PATH: /data/voxelsets
VOXELIZER_MOCK_EXECUTION: "true"
```

데이터는 Docker volume `backend-storage`에 저장됩니다.

컨테이너 내부 경로:

- 업로드된 원본 3D Tiles: `/data/3dtiles/projects/...`
- 기본 voxel 결과: `/data/voxelsets/projects/...`
- diff voxel 결과: `/data/voxelsets/projects/.../diffs/...`
- job 로그: `/data/jobs/...`

## 8. 실제 Voxelizer 실행 모드

프론트엔드 API 테스트에는 mock 모드를 권장합니다.

실제 voxelizer jar를 Docker에서 실행하려면:

1. `backend/docker-compose.yml`의 `VOXELIZER_MOCK_EXECUTION`을 `"false"`로 변경
2. 컨테이너 안의 `VOXELIZER_JAR_PATH`에 실제 jar가 존재하도록 이미지 또는 volume 구성
3. 다시 빌드/실행

```powershell
docker compose -f backend\docker-compose.yml up -d --build
```

로컬 PC에서 직접 jar 연계를 확인하려면 Docker 대신 local 프로필을 사용할 수 있습니다.

```powershell
cd backend
.\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

local 경로 설정:

```text
backend/src/main/resources/application-local.yml
```

## 9. 개발자용 테스트

Spring 테스트 실행:

```powershell
cd backend
.\gradlew.bat test
```

OpenAPI JSON 파일 생성:

```powershell
cd backend
.\gradlew.bat generateApiDocs
```

생성 위치:

```text
backend/build/docs/api/openapi.json
```
