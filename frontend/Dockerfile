# ---- build stage ----
FROM node:18-bookworm-slim AS build
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Baked in at build time — this is what the frontend calls in the browser,
# so it must be an address the OFFICE MACHINE can reach, not "localhost".
# Left empty on purpose — the frontend calls relative paths (e.g. /api/projects),
# and nginx (see nginx.conf) proxies those internally to the backend container.
# This works identically whether accessed via the internal IP or the external
# HTTPS domain, and avoids mixed-content errors entirely.
ARG VITE_EXTERNAL_API_URL=
ENV VITE_EXTERNAL_API_URL=$VITE_EXTERNAL_API_URL

RUN npm run build

# ---- serve stage ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80