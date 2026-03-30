# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeerFlow is a full-stack "super agent harness" that orchestrates sub-agents, memory, and sandboxes to do almost anything — powered by extensible skills.

- **Backend**: Python 3.12+, LangGraph-based agent system with FastAPI Gateway
- **Frontend**: Next.js 16 + React 19 + TypeScript 5.8 + Tailwind CSS 4 + pnpm 10.26.2
- **Unified Entry**: Nginx reverse proxy on port 2026 routes to all services

## Commands

All commands should be run from the **repository root** unless otherwise specified.

### Bootstrap and Setup

| Command | Purpose |
|---------|---------|
| `make check` | Verify Node.js 22+, pnpm, uv, nginx are installed |
| `make config` | Generate `config.yaml` from template (first-time only) |
| `make install` | Install all dependencies (backend + frontend) |
| `make setup-sandbox` | Pre-pull sandbox container image (recommended for Docker sandbox mode) |

### Development

| Command | Purpose |
|---------|---------|
| `make dev` | Start all services (LangGraph + Gateway + Frontend + Nginx) with hot-reload |
| `make dev-daemon` | Start all services in background |
| `make start` | Start all services in production mode |
| `make stop` | Stop all running services |
| `make clean` | Stop services and clean up temp files |

### Docker Development

| Command | Purpose |
|---------|---------|
| `make docker-init` | Initialize Docker environment (pull images, install deps) |
| `make docker-start` | Start Docker services (mode-aware from `config.yaml`, port 2026) |
| `make docker-stop` | Stop Docker development services |
| `make docker-logs` | View Docker logs |
| `make up` | Build and start production Docker services |
| `make down` | Stop production Docker containers |

### Backend-only (from `backend/`)

| Command | Purpose |
|---------|---------|
| `make dev` | Run LangGraph server only (port 2024) |
| `make gateway` | Run Gateway API only (port 8001) |
| `make test` | Run all backend tests with pytest |
| `make lint` | Lint with ruff |
| `make format` | Format code with ruff |

### Frontend-only (from `frontend/`)

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Dev server with Turbopack (port 3000) |
| `pnpm build` | Production build (requires `BETTER_AUTH_SECRET` or `SKIP_ENV_VALIDATION=1`) |
| `pnpm lint` | ESLint only |
| `pnpm lint:fix` | ESLint with auto-fix |
| `pnpm typecheck` | TypeScript type check (`tsc --noEmit`) |
| `pnpm check` | Lint + type check combined |

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        DeerFlow System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Browser ──▶ Nginx (port 2026) ──┬──▶ Frontend (port 3000)     │
│                                  ├──▶ Gateway API (port 8001)   │
│                                  └──▶ LangGraph (port 2024)     │
│                                           │                     │
│                                           ▼                     │
│                                     Agent Runtime               │
│                                     - Lead Agent                │
│                                     - Middleware Chain          │
│                                     - Tools (Sandbox, MCP)      │
│                                     - Subagents                 │
│                                     - Memory                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Service Architecture

**Nginx (port 2026)** — Unified reverse proxy entry point:
- `/api/langgraph/*` → LangGraph Server (port 2024)
- `/api/*` (other) → Gateway API (port 8001)
- `/` (non-API) → Frontend (port 3000)

**LangGraph Server (port 2024)** — Agent runtime:
- Entry point: `deerflow.agents:make_lead_agent` (defined in `backend/langgraph.json`)
- Orchestrates the lead agent with middleware chain, tools, subagents, and memory
- Handles streaming responses via SSE

**Gateway API (port 8001)** — FastAPI REST API:
- Models, MCP, Skills, Memory, Uploads, Threads, Artifacts, Agents, Suggestions
- Bridges LangGraph with external integrations
- Optional: Provisioner service (port 8002) for Kubernetes sandbox mode

**Frontend (port 3000)** — Next.js web interface:
- Thread-based AI conversations with streaming
- Artifact viewer and file management
- Skills and MCP configuration UI

### Backend Architecture

The backend is split into two layers with a strict dependency direction:

```
App Layer (app/):          Harness Layer (packages/harness/deerflow/):
├── Gateway API            ├── Agents (lead agent, middlewares, memory)
└── Channels (IM bots)     ├── Sandbox (execution environment)
                           ├── Subagents (delegation)
                           ├── Tools (built-in, MCP, community)
                           ├── Skills (discovery, loading)
                           ├── Models (factory with thinking/vision)
                           └── Config (app, model, sandbox)
```

**Critical Rule**: App imports deerflow, but deerflow never imports app. This boundary is enforced by CI via `tests/test_harness_boundary.py`.

### Middleware Chain (Execution Order)

Middlewares execute in strict order for every agent turn:

1. **ThreadDataMiddleware** — Create per-thread directories
2. **UploadsMiddleware** — Track and inject uploaded files
3. **SandboxMiddleware** — Acquire sandbox, store `sandbox_id`
4. **DanglingToolCallMiddleware** — Handle interrupted tool calls
5. **GuardrailMiddleware** — Pre-tool-call authorization (if enabled)
6. **SummarizationMiddleware** — Context reduction at token limits (if enabled)
7. **TodoListMiddleware** — Task tracking in plan mode (if `is_plan_mode`)
8. **TitleMiddleware** — Auto-generate thread title
9. **MemoryMiddleware** — Queue conversations for memory update
10. **ViewImageMiddleware** — Inject base64 images (if vision supported)
11. **SubagentLimitMiddleware** — Enforce concurrent subagent limit (if enabled)
12. **ClarificationMiddleware** — Intercept `ask_clarification` (must be last)

### Key Directories

```
deer-flow/
├── backend/
│   ├── packages/harness/deerflow/  # Agent framework (deerflow.* imports)
│   │   ├── agents/                 # Lead agent, middlewares, memory, thread state
│   │   ├── sandbox/                # Sandbox execution system
│   │   ├── subagents/              # Subagent delegation
│   │   ├── tools/                  # Built-in tools
│   │   ├── mcp/                    # MCP integration
│   │   ├── skills/                 # Skills system
│   │   ├── models/                 # Model factory
│   │   └── config/                 # Configuration system
│   ├── app/                        # Application layer (app.* imports)
│   │   ├── gateway/                # FastAPI Gateway
│   │   └── channels/               # IM integrations (Feishu, Slack, Telegram)
│   ├── tests/                      # Test suite
│   └── docs/                       # Documentation
├── frontend/
│   ├── src/app/                    # Next.js routes
│   ├── src/components/             # React components
│   ├── src/core/                   # Business logic (threads, API, models)
│   └── src/server/                 # Server-side code
├── skills/
│   ├── public/                     # Public skills (committed)
│   └── custom/                     # Custom skills (gitignored)
├── docker/                         # Docker compose and nginx configs
└── scripts/                        # Build and deployment scripts
```

## Configuration

**Primary Config**: `config.yaml` (gitignored, copied from `config.example.yaml`)
- Models with provider settings
- Sandbox mode (local/docker/provisioner)
- Tool groups and MCP servers
- Memory, title, summarization settings
- IM channel credentials

**Extensions Config**: `extensions_config.json` (gitignored, copied from `extensions_config.example.json`)
- MCP server definitions
- Skill enablement state

Both support hot-reload; Gateway and LangGraph detect changes automatically.

## Development Workflow

### Running the Full Application

```bash
make dev
```

Access: http://localhost:2026

### Running Backend Services Separately

```bash
# Terminal 1: LangGraph server
cd backend && make dev

# Terminal 2: Gateway API
cd backend && make gateway

# Terminal 3: Frontend
cd frontend && pnpm dev

# Terminal 4: Nginx
nginx -c $(pwd)/docker/nginx/nginx.local.conf -g 'daemon off;'
```

### Pre-Checkin Validation

Before submitting changes, run:

```bash
# Backend (CI-enforced)
cd backend && make lint && make test

# Frontend (if touched)
cd frontend && pnpm lint && pnpm typecheck

# Frontend build (if changing env/auth/routing)
cd frontend && BETTER_AUTH_SECRET=local-dev-secret pnpm build
```

## Code Style

### Python (Backend)
- **Linter**: ruff (configured in `backend/ruff.toml`)
- **Line length**: 240 characters
- **Python**: 3.12+ with type hints
- **Import conventions**:
  - Harness internal: `from deerflow.agents import make_lead_agent`
  - App internal: `from app.gateway.app import app`
  - App → Harness: Allowed
  - Harness → App: **FORBIDDEN** (enforced by CI)

### TypeScript (Frontend)
- **Imports**: Enforced ordering (builtin → external → internal → parent → sibling), alphabetized, newlines between groups
- **Type imports**: Use inline style: `import { type Foo }`
- **Unused variables**: Prefix with `_`
- **Tailwind classes**: Use `cn()` from `@/lib/utils` for conditional classes
- **Path alias**: `@/*` maps to `src/*`
- **Generated code**: `ui/` and `ai-elements/` are auto-generated — don't manually edit

## Important Patterns

### Environment Variables
- Config values starting with `$` are resolved as environment variables (e.g., `$OPENAI_API_KEY`)
- Frontend: `NEXT_PUBLIC_BACKEND_BASE_URL` and `NEXT_PUBLIC_LANGGRAPH_BASE_URL` default to nginx proxy paths

### Sandbox Paths (Virtual → Physical)
- Agent sees: `/mnt/user-data/{workspace,uploads,outputs}`, `/mnt/skills`
- Physical: `backend/.deer-flow/threads/{thread_id}/user-data/...`, `skills/`

### Thread State
Stored in LangGraph checkpointer, extended with:
- `sandbox` — sandbox provider state
- `artifacts` — generated files (with deduplication reducer)
- `todos` — task list in plan mode
- `uploaded_files` — user uploads
- `viewed_images` — base64 images for vision

## Documentation

- `backend/CLAUDE.md` — Detailed backend architecture
- `frontend/CLAUDE.md` — Frontend architecture and patterns
- `backend/docs/` — Configuration and feature documentation
- `CONTRIBUTING.md` — Development environment setup

## CI/CD

- Backend unit tests: `.github/workflows/backend-unit-tests.yml`
- Runs on PR: `make lint`, `make test`
- Regression tests: Docker sandbox mode detection, provisioner kubeconfig handling, harness boundary
