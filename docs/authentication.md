# 지정 계정 로그인

서버에서 지정한 계정 한 개만 사용할 수 있습니다. 회원가입은 제공하지 않습니다.
API, 파일, Swagger와 actuator는 로그인 세션이 있어야 접근할 수 있습니다.
계정을 설정하지 않으면 모든 로그인 시도를 차단합니다.

## 설정

Docker Compose 실행 시 `.env`에 아래 값을 설정하세요.
루트의 `.env`는 `--env-file .env`, `backend/.env`는 `--env-file backend/.env`로 지정합니다.
비밀번호는 충분히 긴 임의의 값을 사용하고 저장소에 커밋하지 마세요.

```dotenv
AUTH_USERNAME=your-designated-id
AUTH_PASSWORD=your-private-password
AUTH_COOKIE_SECURE=true
```

로컬 HTTP 테스트 또는 신뢰할 수 있는 내부망에서 HTTP 업로드할 때
`AUTH_COOKIE_SECURE=false`로 설정합니다. HTTP는 비밀번호와 데이터를 암호화하지 않습니다.
업로드 완료 후 HTTPS 운영은 `true`로 되돌립니다.
Java 직접 실행에서는 동일한 이름의 환경변수를 설정합니다.
계정 변경은 백엔드 재시작 후 적용되며 기존 세션도 종료됩니다.

프론트엔드와 백엔드를 다시 빌드하여 함께 배포해야 합니다.
운영 환경에서는 HTTPS와 동일 출처 `/api`, `/files` 프록시를 사용하세요.
개발 시 `localhost:5173`과 `localhost:8080`을 사용하며, 양쪽 호스트 이름을
동일하게 맞춰야 SameSite=Lax 세션 쿠키를 전달할 수 있습니다.
프론트와 API가 서로 다른 사이트인 배포는 지원하지 않습니다.

## 동작 및 범위

- 비밀번호는 서버 메모리에 BCrypt 해시로 등록하고 브라우저 저장소에 보관하지 않습니다.
- HttpOnly 세션 쿠키와 기본 CSRF 보호를 사용합니다. 유휴 세션은 30분 후 만료됩니다.
- 로그인 전에는 뷰어를 생성하지 않으며, 세션 만료 시 로그인 화면으로 돌아갑니다.
- 파일 업로드, 보고서와 Cesium 타일 요청에도 세션을 전달합니다.
- 서버 메모리 세션이므로 여러 백엔드 인스턴스에서는 세션 공유가 추가로 필요합니다.
- 역할 구분, 계정 관리, 로그인 시도 제한은 이번 최소 기능의 범위에 포함하지 않습니다.

인증 테스트는 실제 보안 필터를 켜고 실행합니다. 기존 컨트롤러 테스트는
필터를 제외하여 업무 기능을 별도로 검증합니다.

## 내부망 대용량 업로드 및 배포

프론트엔드 기본 파일 제한은 1024 MiB이며 Nginx는 multipart 부가 데이터를
포함해 1025 MiB까지 허용합니다. 백엔드 요청 제한은 2GB입니다.
외부 HTTPS 프록시의 100MB 제한은 별도로 유지되므로 큰 파일은 내부망의
`http://서버IP:8090`으로 업로드합니다.

프로젝트 루트에서 이미지를 빌드합니다.

```sh
docker build -t vbcd-backend:latest backend
docker build --build-arg VITE_EXTERNAL_API_URL= -t vbcd-frontend:latest frontend
```

서버 루트 `.env`의 기존 DB 설정과 데이터 경로를 유지하고 `SERVER_PORT=8081`,
`FRONTEND_PORT=8090`을 설정합니다. DB 외부 포트는 기존 값(예: 5434)을 유지합니다.
새 이미지를 서버에 불러온 뒤 기존 Compose 프로젝트에서 실행합니다.

```sh
docker compose --env-file .env -f backend/docker-compose.prod.yml -f backend/docker-compose.frontend.yml up -d --no-deps --force-recreate vbcd-backend vbcd-frontend
```

기존 실행 시 `-p`를 사용했다면 같은 프로젝트 이름을 지정합니다.
`.env`와 Docker 이미지 tar 파일은 커밋하지 않습니다.
