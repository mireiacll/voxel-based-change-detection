# Voxel Based Change Detection

[English](README.md) | **한국어**

드론 측량으로 만든 3D Tiles를 날짜별로 관리하고, voxel 기반의 변화량을 비교·시각화하는 웹 애플리케이션입니다.

- **Frontend**: React 18, Vite, CesiumJS
- **Backend**: Java 21, Spring Boot, Gradle
- **Database**: PostgreSQL 16, PostGIS
- **Processing**: mago-voxelizer를 이용한 voxel 생성 및 A/B·시계열 변화 분석

처음 프로젝트를 실행한다면 아래의 **Getting Started** 순서대로 백엔드를 Docker로 먼저 실행한 뒤 프론트엔드를 실행하세요. 프로젝트·관측 데이터 관리 화면과 API는 먼저 확인할 수 있지만, **복셀 생성과 변화 분석을 실행하려면 입체격자체계 프로젝트의 voxelizer JAR를 별도로 받아 연결해야 합니다.** 이 저장소에는 voxelizer JAR나 mock voxelizer가 포함되어 있지 않습니다.

## 프로젝트 구조

```text
voxel-based-change-detection/
├── frontend/                  # React + Vite 기반 Cesium 3D Viewer
│   ├── src/
│   │   ├── components/       # 프로젝트, 업로드, 분석 화면 UI
│   │   ├── cesium/           # Viewer 초기화, 레이어, 카메라 동기화
│   │   ├── api.js            # Backend REST API 연동
│   │   └── App.jsx           # 애플리케이션 상태 및 화면 구성
│   ├── package.json
│   └── vite.config.js
├── backend/                   # Spring Boot REST API
│   ├── src/main/java/        # 프로젝트, 관측 데이터, 분석, 작업 API
│   ├── src/main/resources/   # 애플리케이션 설정
│   ├── docker-compose.yml    # Backend + PostGIS 공통 개발 설정
│   ├── docker-compose.local.yml # 로컬 경로/JAR를 연결하는 개발용 override
│   ├── docker-compose.prod.yml  # 경로와 이미지를 환경 변수로 받는 배포 설정
│   └── build.gradle
├── docs/                      # 프로젝트 문서
└── storage/                   # 로컬 실행 시 생성되는 데이터(버전 관리 제외)
```

데이터 흐름은 다음과 같습니다.

```text
Browser (localhost:5173)
    └─ REST API / 3D Tiles 요청
       └─ Spring Boot (localhost:8080)
          ├─ PostgreSQL/PostGIS (localhost:5432)
          └─ 별도로 연결한 mago-voxelizer JAR 실행
```

주요 도메인 용어:

| 용어 | 설명 |
|---|---|
| Project | 변화 탐지를 수행하는 대상 지역/현장 |
| Observation | 특정 날짜에 촬영·변환한 3D Tiles 데이터 |
| Diff | 두 Observation 또는 여러 시점 사이의 voxel 변화 분석 |
| Job | 업로드 후 voxel 생성, Diff 실행 등 백그라운드 작업 |

## Getting Started

### 1. 사전 준비

다음 도구를 설치합니다.

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18 이상과 npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Docker Compose 포함)

Java와 PostgreSQL은 기본 실행 방법에서는 Docker 컨테이너 안에서 실행되므로 별도 설치가 필요하지 않습니다.

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

### 2. 저장소 받기

```powershell
git clone <repository-url>
cd voxel-based-change-detection
```

이미 저장소를 받은 상태라면 저장소 루트에서 다음 단계부터 진행합니다.

### 3. 로컬 voxelizer 경로 설정

Backend를 실행하기 전에 입체격자체계 프로젝트에서 다음 파일을 별도로 받습니다.

- `mago-voxelizer` 실행 JAR
- 분석 영역을 정의하는 GeoPackage (`Asan-LandCoverIndex-Vegetation.gpkg`)
- 입력·출력 데이터를 저장할 로컬 디렉터리

`backend/docker-compose.local.yml`을 열고 `volumes`의 **왼쪽 호스트 경로**를 실제 PC 경로로 변경합니다. 오른쪽 컨테이너 경로는 변경하지 않습니다.

```yaml
volumes:
  - D:/vbcd-data:/data
  - D:/tools/mago-voxelizer.jar:/app/mago-voxelizer.jar:ro
```

GeoPackage는 첫 번째 경로로 지정한 데이터 디렉터리 바로 아래에 둡니다.

```text
D:/vbcd-data/Asan-LandCoverIndex-Vegetation.gpkg
```

> `docker-compose.local.yml`에 들어 있는 예시 절대 경로는 다른 PC에서 그대로 동작하지 않습니다. Backend를 시작하기 전에 데이터 디렉터리, JAR, GeoPackage 세 경로가 실제로 존재하는지 반드시 확인하세요. 개인 PC 경로로 수정한 파일은 커밋하지 않습니다.

### 4. Backend와 Database 실행

로컬 개발에서는 공통 설정과 local override를 함께 사용합니다. 저장소 루트에서 실행합니다.

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  up -d --build
```

최초 실행은 Backend 이미지를 빌드하고 PostGIS 이미지를 내려받기 때문에 시간이 걸릴 수 있습니다. 컨테이너 상태를 확인합니다.

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  ps
```

`backend-api`와 `backend-postgis`가 실행 중이면 아래 주소를 확인합니다.

- Swagger UI: http://localhost:8080/swagger-ui/index.html
- Project API: http://localhost:8080/api/projects

첫 실행 시 `Sample Change Detection Project` 샘플 프로젝트 한 개가 자동 생성됩니다.

문제가 있으면 Backend 로그를 확인합니다.

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  logs -f vbcd-backend
```

로그 보기를 종료할 때는 `Ctrl+C`를 누릅니다. 컨테이너는 계속 실행됩니다.

### 5. Frontend 실행

새 터미널을 열어 실행합니다.

```powershell
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다. 기본 설정에서 Frontend는 `http://localhost:8080`의 Backend API를 사용합니다.

API 주소가 다르면 `frontend/.env.local` 파일을 만들고 다음 값을 지정합니다.

```dotenv
VITE_EXTERNAL_API_URL=http://localhost:8080
```

환경 변수를 변경한 뒤에는 `npm run dev`를 다시 시작해야 합니다.

### 6. 기본 동작 확인

1. Frontend에서 샘플 프로젝트가 표시되는지 확인합니다.
2. Swagger UI에서 `GET /api/projects`를 실행해 응답을 확인합니다.
3. 필요하면 새 프로젝트를 만들고 날짜별 Observation을 업로드합니다.

업로드할 파일은 **ZIP 루트에 `tileset.json`과 `data/` 폴더가 있는 3D Tiles**여야 합니다.

```text
observation.zip
├── tileset.json
└── data/
    └── ...
```

> 프로젝트 조회·등록 같은 일반 API는 voxelizer JAR 없이 확인할 수 있습니다. 다만 Observation의 복셀 생성과 A/B·시계열 변화 분석은 JAR를 연결하기 전에는 정상 실행되지 않습니다. 해당 기능을 개발하거나 시험하려면 다음의 **voxelizer JAR 연결** 단계를 먼저 진행하세요.

## 종료 및 초기화

Frontend 개발 서버는 실행 중인 터미널에서 `Ctrl+C`로 종료합니다.

Backend와 Database를 종료하되 데이터를 유지하려면:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  down
```

Database와 업로드 데이터를 포함한 Docker 볼륨까지 초기화하려면:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  down -v
```

> `down -v`는 로컬 개발 데이터를 삭제하므로 필요한 데이터가 없는지 확인한 뒤 실행하세요.

## 자주 사용하는 개발 명령

### Frontend

```powershell
cd frontend
npm run dev       # 개발 서버
npm run build     # 배포용 빌드
npm run preview   # 빌드 결과 미리 보기
```

### Backend

Backend를 Docker 없이 직접 실행하려면 Java 21과 로컬 PostgreSQL이 필요합니다. 기본 DB 접속값은 `localhost:5432`, DB `voxel_change_detection`, 사용자/비밀번호 `voxel`입니다.

```powershell
cd backend
.\gradlew.bat bootRun
.\gradlew.bat test
```

macOS/Linux에서는 `./gradlew bootRun`, `./gradlew test`를 사용합니다.

### Docker

```powershell
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml ps
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml logs -f vbcd-backend
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml up -d --build
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml down
```

## 배포 환경 실행 (`docker-compose.prod.yml`)

배포 환경에서는 `docker-compose.prod.yml`을 단독으로 사용합니다. 이 파일은 소스에서 Backend 이미지를 빌드하지 않으므로 먼저 사용할 이미지를 준비해야 합니다.

```powershell
docker build -t vbcd-backend:latest backend
```

배포 서버의 실제 경로와 비밀번호를 환경 변수로 설정합니다.

```powershell
$env:VBCD_BACKEND_IMAGE="vbcd-backend:latest"
$env:VBCD_DATA_DIR="D:/vbcd/data"
$env:VBCD_DB_DIR="D:/vbcd/postgis-data"
$env:VOXELIZER_HOST_JAR="D:/vbcd/mago-voxelizer.jar"
$env:DB_PASSWORD="change-me"
```

`VBCD_DATA_DIR`에는 `Asan-LandCoverIndex-Vegetation.gpkg`가 있어야 하고, `VOXELIZER_HOST_JAR`는 입체격자체계 프로젝트에서 받은 실제 JAR를 가리켜야 합니다. 디렉터리와 파일이 존재하는지 확인한 뒤 실행합니다.

```powershell
docker compose -f backend\docker-compose.prod.yml up -d
docker compose -f backend\docker-compose.prod.yml ps
docker compose -f backend\docker-compose.prod.yml logs -f vbcd-backend
```

배포 환경 종료:

```powershell
docker compose -f backend\docker-compose.prod.yml down
```

운영 DB 비밀번호와 서버 경로를 Compose 파일에 직접 기록하거나 저장소에 커밋하지 마세요. 상세한 API 및 배포 설정은 [Backend README](backend/README.md)를 참고하세요.

## 환경 및 포트

| 구성 요소 | 기본 주소/포트 | 비고 |
|---|---|---|
| Frontend | http://localhost:5173 | Vite 개발 서버 |
| Backend API | http://localhost:8080 | Spring Boot |
| Swagger UI | http://localhost:8080/swagger-ui/index.html | API 문서 및 테스트 |
| PostgreSQL/PostGIS | localhost:5432 | Docker 개발 환경 |

주요 Backend 환경 변수:

| 변수 | 기본값 | 설명 |
|---|---|---|
| `DB_HOST` | `localhost` | Database 호스트 |
| `DB_PORT` | `5432` | Database 포트 |
| `DB_NAME` | `voxel_change_detection` | Database 이름 |
| `DB_USER` / `DB_PASSWORD` | `voxel` / `voxel` | 로컬 개발용 계정 |
| `VOXELIZER_STORAGE_ROOT` | `/data` | Docker 내부 데이터 루트 |
| `VOXELIZER_JAR_PATH` | `/app/mago-voxelizer.jar` | 별도로 받은 voxelizer JAR의 컨테이너 내부 경로 |

## 문제 해결

- **Frontend에 프로젝트가 표시되지 않음**: http://localhost:8080/api/projects 가 열리는지 확인하고 Backend 로그를 봅니다.
- **8080 또는 5432 포트 충돌**: 해당 포트를 사용 중인 프로그램을 종료하거나 `backend/docker-compose.yml`의 호스트 포트를 변경합니다. Backend 포트를 바꿨다면 `VITE_EXTERNAL_API_URL`도 함께 변경합니다.
- **`npm install` 또는 Docker build 실패**: 인터넷 연결과 사내 proxy/VPN 설정을 확인합니다.
- **CORS 오류**: 기본 Backend는 `localhost`와 `127.0.0.1`의 로컬 포트를 허용합니다. 다른 도메인에서 접속하면 `CORS_ALLOWED_ORIGIN_PATTERNS`를 설정합니다.
- **업로드가 거부됨**: ZIP 최상위에 `tileset.json`이 있는지, 전체 요청 크기가 2GB 이하인지 확인합니다.

## 더 알아보기

- [Frontend README](frontend/README.md): 화면 구성, 데이터 모델, 3D Tiles 변환
- [Backend README](backend/README.md): Swagger 기반 API 테스트, 실제 voxelizer, 배포 Compose
