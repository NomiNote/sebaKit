# Dockerize Frontend & Backend (Lightweight Image)

## Description

Create a single Docker image that runs both the **frontend** (Vite/React) and the **backend** (Go/Gin) together, displaying their logs side-by-side in a split terminal view. The simulator is **excluded** from the image.

## Goals

- **Minimal image size** — use multi-stage builds and Alpine/scratch-based images
- **Single container** runs both services, managed via `tmux` (or a lightweight process supervisor like `overmind`/`s6-overlay`)
- **Split terminal output** — when attached to the container, the user sees frontend Vite logs in one pane and backend logs in another

## Technical Details

### Stack

| Component | Tech | Port |
|-----------|------|------|
| Frontend | React 18 + Vite 6 + TailwindCSS 3 | `5173` |
| Backend | Go 1.25 + Gin + SQLite (modernc) | `8080` |

### Proposed Approach

1. **Multi-stage Dockerfile**
   - **Stage 1 — Frontend build**: `node:22-alpine` → `npm ci` + `npm run build` → produces `frontend/dist/`
   - **Stage 2 — Backend build**: `golang:1.25-alpine` → `go build` with CGO disabled → produces a static binary
   - **Stage 3 — Runtime**: `alpine:latest` (tiny base) → copy frontend dist + backend binary + install `tmux`

2. **Entrypoint script** (`docker-entrypoint.sh`)
   - Starts a `tmux` session with two panes:
     - **Left pane**: Backend binary (`./backend`)
     - **Right pane**: Vite dev server (`npx vite --host`) _or_ a lightweight static file server (e.g. `caddy`/`serve`) pointing at `frontend/dist/`
   - Attaches to the tmux session so `docker run -it` shows the split view

3. **`.dockerignore`**
   - Exclude: `simulator/`, `esp32_firmware/`, `node_modules/`, `.git/`, `*.exe`, `frontend/dist/`

### Dev vs Prod Mode

- **Production (default)**: Frontend is pre-built (`npm run build`) and served via the Go backend or a tiny static server — no Node.js needed at runtime, smallest footprint
- **Development (optional future flag)**: Mount source, run Vite dev server with HMR — larger image but enables live reload

## Acceptance Criteria

- [ ] `docker build -t sebakit .` builds successfully
- [ ] `docker run -it sebakit` shows a tmux split with frontend & backend logs
- [ ] Final image size is **< 100 MB** (target: ~50-80 MB)
- [ ] Simulator code is not included in the image
- [ ] Backend can reach its SQLite database (volume-mountable `data/` dir)
- [ ] Frontend can reach the backend API
- [ ] `.dockerignore` is present and correct

## Labels

`enhancement`, `devops`, `docker`
