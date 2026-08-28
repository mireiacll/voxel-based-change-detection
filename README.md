# Voxel Based Change Detection

**English** | [한국어](README-KO.md)

A web application for managing date-based drone survey 3D Tiles and visualizing voxel-based changes between observations.

- **Frontend:** React 18, Vite, and CesiumJS
- **Backend:** Java 21, Spring Boot, and Gradle
- **Database:** PostgreSQL 16 with PostGIS
- **Processing:** mago-voxelizer for voxel creation, A/B comparison, and time-series analysis

Follow **Getting Started** to configure the local paths, start the backend and database, and then run the frontend. Project and observation management can be inspected without running a voxel job, but **voxel creation and change analysis require a voxelizer JAR obtained separately from the Spatial Grid System project**. This repository includes neither the voxelizer JAR nor a mock voxelizer.

## Project structure

```text
voxel-based-change-detection/
├── frontend/                     # React/Vite Cesium 3D viewer
│   ├── src/
│   │   ├── components/          # Project, upload, and analysis UI
│   │   ├── cesium/              # Viewer, layers, drawing, and camera sync
│   │   ├── api.js               # Backend REST API adapter
│   │   └── App.jsx              # Application state and page composition
│   ├── package.json
│   └── vite.config.js
├── backend/                      # Spring Boot REST API
│   ├── src/main/java/           # Project, observation, diff, and job APIs
│   ├── src/main/resources/      # Application configuration
│   ├── docker-compose.yml       # Shared backend and PostGIS configuration
│   ├── docker-compose.local.yml # Local paths and voxelizer override
│   ├── docker-compose.prod.yml  # Environment-driven deployment setup
│   └── build.gradle
├── docs/                         # Project documentation
└── storage/                      # Local runtime data (ignored by Git)
```

Runtime data flow:

```text
Browser (localhost:5173)
    └─ REST API and 3D Tiles requests
       └─ Spring Boot (localhost:8080)
          ├─ PostgreSQL/PostGIS (localhost:5432)
          └─ Separately mounted mago-voxelizer JAR
```

Core domain terms:

| Term | Description |
|---|---|
| Project | A site or area monitored for change |
| Observation | 3D Tiles captured and converted for a specific date |
| Diff | A voxel comparison between two observations or across a time series |
| Job | A background voxelization, diff, or deletion task |

## Getting Started

### 1. Prerequisites

Install:

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18 or later, including npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), including Docker Compose

Java and PostgreSQL do not need to be installed separately when using Docker.

```powershell
git --version
node --version
npm --version
docker --version
docker compose version
```

### 2. Get the repository

```powershell
git clone <repository-url>
cd voxel-based-change-detection
```

If the repository is already available, continue from its root directory.

### 3. Configure local voxelizer paths

Obtain the following separately from the Spatial Grid System project or its maintainer:

- A runnable `mago-voxelizer` JAR
- The analysis-region GeoPackage named `Asan-LandCoverIndex-Vegetation.gpkg`
- A local directory for input and output data

Open `backend/docker-compose.local.yml` and replace the **host paths on the left** of the volume mappings with paths that exist on your machine. Keep the container paths on the right unchanged.

```yaml
volumes:
  - D:/vbcd-data:/data
  - D:/tools/mago-voxelizer.jar:/app/mago-voxelizer.jar:ro
```

Place the GeoPackage directly inside the mapped data directory:

```text
D:/vbcd-data/Asan-LandCoverIndex-Vegetation.gpkg
```

> The absolute paths currently shown in `docker-compose.local.yml` are machine-specific examples. Before starting the backend, verify that the data directory, JAR, and GeoPackage all exist. Do not commit personal path changes.

### 4. Start the backend and database

Local development uses the shared Compose file together with the local override. Run from the repository root:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  up -d --build
```

The first run may take several minutes while Docker downloads PostGIS and builds the backend image. Check the services:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  ps
```

When `backend-api` and `backend-postgis` are running, open:

- Swagger UI: http://localhost:8080/swagger-ui/index.html
- Projects API: http://localhost:8080/api/projects

The backend creates a `Sample Change Detection Project` on the first startup.

To inspect backend logs:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  logs -f vbcd-backend
```

Press `Ctrl+C` to leave the log stream; the containers remain running.

### 5. Start the frontend

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. By default, the frontend connects to the backend at `http://localhost:8080`.

If the API runs elsewhere, create `frontend/.env.local`:

```dotenv
VITE_EXTERNAL_API_URL=http://localhost:8080
```

Restart `npm run dev` after changing the environment file.

### 6. Verify the application

1. Confirm that the sample project appears in the frontend.
2. Run `GET /api/projects` in Swagger UI.
3. Create a project and upload observations for different dates as needed.

An uploaded archive must be a 3D Tiles ZIP with `tileset.json` and `data/` at its root:

```text
observation.zip
├── tileset.json
└── data/
    └── ...
```

> General project and observation APIs can be inspected before running processing tasks. Observation voxelization and A/B or time-series analysis will not run successfully until the separately supplied voxelizer JAR and GeoPackage are mounted correctly.

## Stop or reset the local environment

Stop the frontend with `Ctrl+C` in its terminal.

Stop the backend and database while retaining data:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  down
```

Remove the containers and Docker volumes, including the development database and uploaded data:

```powershell
docker compose `
  -f backend\docker-compose.yml `
  -f backend\docker-compose.local.yml `
  down -v
```

> `down -v` deletes local development data. Verify that nothing needs to be retained before running it.

## Common development commands

### Frontend

```powershell
cd frontend
npm run dev       # Start the development server
npm run build     # Create a production build
npm run preview   # Preview the production build
```

### Backend without Docker

Running the backend directly requires Java 21 and a local PostgreSQL instance. The default connection is `localhost:5432`, database `voxel_change_detection`, username `voxel`, and password `voxel`.

```powershell
cd backend
.\gradlew.bat bootRun
.\gradlew.bat test
```

Use `./gradlew bootRun` and `./gradlew test` on macOS or Linux.

### Local Docker Compose

```powershell
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml ps
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml logs -f vbcd-backend
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml up -d --build
docker compose -f backend\docker-compose.yml -f backend\docker-compose.local.yml down
```

## Production deployment

Use `docker-compose.prod.yml` by itself for deployment. It does not build the backend from source, so prepare an image first:

```powershell
docker build -t vbcd-backend:latest backend
```

Set the deployment server's actual paths and credentials:

```powershell
$env:VBCD_BACKEND_IMAGE="vbcd-backend:latest"
$env:VBCD_DATA_DIR="D:/vbcd/data"
$env:VBCD_DB_DIR="D:/vbcd/postgis-data"
$env:VOXELIZER_HOST_JAR="D:/vbcd/mago-voxelizer.jar"
$env:DB_PASSWORD="change-me"
```

`VBCD_DATA_DIR` must contain `Asan-LandCoverIndex-Vegetation.gpkg`, and `VOXELIZER_HOST_JAR` must point to the actual JAR obtained from the Spatial Grid System project. Verify every directory and file before starting:

```powershell
docker compose -f backend\docker-compose.prod.yml up -d
docker compose -f backend\docker-compose.prod.yml ps
docker compose -f backend\docker-compose.prod.yml logs -f vbcd-backend
```

Stop the deployment:

```powershell
docker compose -f backend\docker-compose.prod.yml down
```

Do not write production passwords or server-specific paths directly into the Compose file or commit them. See the [Backend README](backend/README.md) for the detailed upload, analysis, and deployment flows.

## Ports and environment

| Component | Default address/port | Notes |
|---|---|---|
| Frontend | http://localhost:5173 | Vite development server |
| Backend API | http://localhost:8080 | Spring Boot |
| Swagger UI | http://localhost:8080/swagger-ui/index.html | API documentation and testing |
| PostgreSQL/PostGIS | localhost:5432 | Docker development environment |

Important backend variables:

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_NAME` | `voxel_change_detection` | Database name |
| `DB_USER` / `DB_PASSWORD` | `voxel` / `voxel` | Local development credentials |
| `VOXELIZER_STORAGE_ROOT` | `/data` | Data root inside the container |
| `VOXELIZER_JAR_PATH` | `/app/mago-voxelizer.jar` | Mounted JAR path inside the container |

## Troubleshooting

- **No projects appear in the frontend:** Open http://localhost:8080/api/projects and inspect the backend logs.
- **Port 8080 or 5432 is already in use:** Stop the conflicting process or change the host mapping. Update `VITE_EXTERNAL_API_URL` if the backend port changes.
- **The voxelizer job fails:** Verify the host JAR and data paths in the selected Compose configuration, and confirm that the GeoPackage exists in the mapped data root.
- **`npm install` or the Docker build fails:** Check the internet connection and any corporate proxy or VPN settings.
- **A CORS error occurs:** The backend allows local `localhost` and `127.0.0.1` origins by default. Set `CORS_ALLOWED_ORIGIN_PATTERNS` for another origin.
- **An upload is rejected:** Verify that `tileset.json` is at the ZIP root and the request is no larger than 2 GB.

## Additional documentation

- [한국어 README](README-KO.md)
- [Frontend README](frontend/README.md): UI structure, data model, and 3D Tiles conversion
- [Backend README](backend/README.md): Swagger workflows, voxelizer integration, and deployment Compose
