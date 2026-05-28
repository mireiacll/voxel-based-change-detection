# Backend API

Minimal Spring Boot API server.

## Requirements

- Java 21
- Gradle 8.x

## Run

```powershell
gradle bootRun
```

The server starts on `http://localhost:8080` by default.

## Endpoints

- `GET /api/health`
- `GET /api/demo`
- `POST /api/demo/echo`
- `GET /actuator/health`

Example:

```powershell
curl http://localhost:8080/api/demo
curl -Method POST http://localhost:8080/api/demo/echo -ContentType "application/json" -Body '{"name":"tester"}'
```

## Test

```powershell
gradle test
```
