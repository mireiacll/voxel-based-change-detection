# Backend API

Minimal Spring Boot API server.

## Requirements

- Java 21
- Gradle 8.x
- Docker Desktop or Docker Engine with Compose

## Run database with Docker Compose

```powershell
docker compose -f backend\docker-compose.yml up -d
```

The default database connection is:

- host: `localhost`
- port: `5432`
- database: `voxel_change_detection`
- username: `voxel`
- password: `voxel`

At startup, Hibernate creates or updates the schema automatically with `spring.jpa.hibernate.ddl-auto=update`. A `CommandLineRunner` seeds the initial sample row when the `samples` table is empty.

## Run backend

```powershell
gradle bootRun
```

The server starts on `http://localhost:8080` by default.
Swagger UI is available at `http://localhost:8080/swagger-ui/index.html`.
OpenAPI JSON is available at `http://localhost:8080/v3/api-docs`.

## Endpoints

- `GET /api/samples`
- `GET /api/samples/{id}`
- `POST /api/samples`
- `PUT /api/samples/{id}`
- `DELETE /api/samples/{id}`

Example:

```powershell
curl http://localhost:8080/api/demo
curl -Method POST http://localhost:8080/api/demo/echo -ContentType "application/json" -Body '{"name":"tester"}'
curl http://localhost:8080/api/samples
curl -Method POST http://localhost:8080/api/samples -ContentType "application/json" -Body '{"name":"sample-2","description":"created from curl"}'
curl -Method PUT http://localhost:8080/api/samples/1 -ContentType "application/json" -Body '{"name":"sample-1-updated","description":"updated from curl"}'
curl -Method DELETE http://localhost:8080/api/samples/1
```

You can override the DB connection with environment variables:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Test

```powershell
gradle test
```

Tests use an embedded H2 datasource with PostgreSQL compatibility mode and create the schema with JPA automatically.
