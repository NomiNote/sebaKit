# ============================================================
# Stage 1: Build Go backend
# ============================================================
FROM golang:1.25-alpine AS backend-build

WORKDIR /build
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o backend .

# ============================================================
# Stage 2: Runtime — Node (for Vite dev server) + backend
# ============================================================
FROM node:22-alpine

RUN apk add --no-cache tmux

WORKDIR /app

# -- Backend binary --
COPY --from=backend-build /build/backend ./backend
RUN chmod +x ./backend

# -- Frontend source + deps --
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --ignore-scripts
COPY frontend/ ./frontend/

# -- Entrypoint --
COPY docker-entrypoint.sh .
RUN chmod +x ./docker-entrypoint.sh

# -- Data directory for SQLite --
RUN mkdir -p ./data

EXPOSE 5173 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
