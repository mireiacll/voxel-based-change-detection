# Voxel Based Change Detection

Voxel Based Change Detection is organized as a multi-part application with a frontend viewer, a backend API, and an existing Python server workspace for voxel processing experiments.

## Project Structure

```text
voxel-based-change-detection/
├── backend/                      # Spring Boot API server
├── frontend/                     # React + Vite frontend application
└── server/                       # Python processing/server workspace
```

## Backend

The backend is a minimal Spring Boot API server.

```powershell
cd backend
.\gradlew.bat bootRun
```

Useful endpoints:

- `GET /api/health`
- `GET /api/demo`
- `POST /api/demo/echo`
- `GET /actuator/health`

Run tests:

```powershell
cd backend
.\gradlew.bat test
```

## Frontend

The frontend is a React + Vite application.

```powershell
cd frontend
npm install
npm run dev
```

## Server

The `server/` directory contains the Python workspace used for voxel processing and related experiments. Keep runtime setup notes, data requirements, and migration instructions close to that workspace when they become stable.

## Contribution Checklist

Before opening or merging a change:

- Run the affected tests or document why they could not be run.
- Keep sample/demo endpoints clearly labeled.
- Avoid committing generated build outputs, local caches, or environment-specific files.
