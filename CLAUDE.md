# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **NOTE:** This file applies primarily to new changes going forward.
> Existing code may not fully conform. Do NOT refactor working code solely to satisfy this document unless explicitly requested.

---

## Project Overview

Radiology Research Platform is a comprehensive research management system for IRB forms, research projects, and workflow automation. It uses a microservices architecture with four main services communicating via HTTP.

## Architecture

```
Frontend (React/Vite :5174)
     │
     ▼
Gateway (Node.js/Express :3001) ──► PostgreSQL (:5434)
     │
     ├──► Forms Service (Python/FastAPI :8001)
     │
     └──► Protocol Assistant (Python/FastAPI :8002)
```

**Service Roles:**
- **Gateway**: Authentication hub, JWT validation, user/project management, proxies requests to other services
- **Forms Service**: Form templates, document generation (DOCX/PDF via LibreOffice)
- **Protocol Assistant**: AI-powered IRB protocol creation with Claude/OpenAI LLMs
- **Frontend**: React SPA with shadcn/ui components, Zustand state, React Query

**Inter-Service Communication:**
- Gateway validates JWT and passes user context via `X-User-ID`, `X-User-Role`, `X-Institution-ID` headers
- Backend services verify `X-Internal-API-Key` and/or a gateway-signed internal token before trusting user context headers
- Services are private-network only (Docker bridge); never trust `X-User-*` headers from public requests
- All services share the same PostgreSQL database

---

## Collaboration Rules

**Correctness first**
- Prefer correct, maintainable solutions over clever ones
- Avoid breaking changes unless explicitly requested
- Preserve existing behavior unless the change request says otherwise

**Small, reviewable changes**
- Make changes in small commits/patches
- Avoid large refactors unless requested
- If a task is big, implement in safe increments

**Don't guess**
- If requirements are ambiguous, state assumptions clearly
- Check the repo for existing patterns before inventing new ones

**Minimal diffs**
- Prefer minimal changes
- Do not reformat or reorganize files unless necessary

### Workflow Expectations

**Before editing:**
- Read relevant files (README, docs, config, existing patterns)
- Identify where similar logic already exists

**For multi-file or architectural changes:**
- Provide a short plan (3–8 bullets) first
- Call out risks and migration needs

**Prefer reversible changes:**
- Use feature flags where appropriate
- Maintain compatibility with existing data formats and interfaces

---

## Git Discipline

**Branching:** `feat/...`, `fix/...`, `chore/...`, `docs/...`

**Commits:**
- `feat: add gateway-signed internal auth token`
- `fix: handle null user context in protocol assistant`
- `chore: bump deps`

Each commit should pass lint/tests where possible.

**No accidental churn:**
- Do not reformat unrelated code
- Do not reorder imports or rename files unless required
- Keep diffs minimal and focused

---

## Coding Standards

**Style:**
- Match existing project conventions
- Keep functions small; avoid deeply nested logic
- Add comments only when they clarify "why," not "what"

**Types & Interfaces:**
- Prefer typed interfaces/schemas at API boundaries
- Validate untrusted input at request handlers
- Avoid stringly-typed objects passed across layers

**Error Handling:**
- Fail closed for auth/security checks
- Return actionable error messages (safe, non-sensitive)
- Log errors with request correlation IDs (no secrets)

**Database Conventions:**
- Follow existing naming conventions in database/ORM/migrations
- If inconsistency exists, align new work with the dominant pattern—don't fix everything
- Prefer reversible migrations when practical; if forward-only, call it out in PR notes
- Use existing migration file naming patterns

**API Response Format:**
- Follow the existing response envelope pattern: `{ data: ..., message: ... }`
- Match the existing error shape—don't redesign
- Include `request_id`/`trace_id` where the codebase supports it

**Frontend Patterns:**
- Follow existing folder/file structure—don't reorganize
- Prefer existing patterns in the repo:
  - React Query for server state
  - Zustand for app UI state
  - Local state for component UI
- Use React Hook Form + Zod for forms where already established

---

## Security Rules (Non-negotiable)

**Secrets:**
- Never commit secrets, API keys, tokens, or private certificates
- Use environment variables and `.env.example` templates
- Redact secrets from logs

**Authentication & Authorization:**
- Services must not trust `X-User-*` headers unless:
  - Requests are private-network only AND
  - Identity is verified via `X-Internal-API-Key` and/or a gateway-signed internal token
- Enforce least privilege (scopes/roles)

**Dependencies:**
- Avoid adding new dependencies unnecessarily
- Prefer mature, widely used libraries
- Note security implications in PR descriptions
- Do not introduce new infrastructure tools (queues, caches, message brokers, etc.) without explicit discussion

---

## HIPAA & Audit Logging

**Required audit logging for:**
- PHI access (view, search, export, download)
- Create/update/delete of patient-linked records
- Admin and configuration changes

**Logging rules:**
- Log minimally necessary info: who, what, when, request_id
- Never log raw PHI or sensitive data
- Use structured logs with correlation IDs

---

## Testing Requirements

**Frameworks:**
- Gateway: Jest (existing)
- Frontend/Python: follow existing setup
- Do not introduce a new test framework if one already exists in that service

**Required Tests:**
- Auth/authz and inter-service identity propagation
- API contract behavior (response envelope + error shape)
- Bug fixes must include regression tests
- Prompt/template changes need golden tests + auto-rollback coverage

No strict coverage % requirement during active development.

---

## LLM Integration Guidelines

**Prompt Changes:**
- Keep prompts versioned and easily rollbackable
- Avoid coupling prompts to transient UI text

**Quality Monitoring:**
- Pattern: evaluate → alert → auto-rollback
- Record prompt version + model version for every request

**Privacy:**
- Do not send PHI/sensitive data to external LLM services unless explicitly approved
- Minimize data shared with LLMs; use redaction where possible
- Never log full raw documents or PHI

---

## Performance & Reliability

- Avoid extra network calls in hot paths
- Cache expensive computations where appropriate
- Set explicit timeouts for all network calls
- Use retries with exponential backoff for transient failures
- Add structured logs for important events with `request_id`/`trace_id`

---

## When Unsure

- State assumptions clearly
- Offer 2–3 options with trade-offs
- Choose the safest default and proceed incrementally

---

## Development Commands

### Docker (Primary)

```bash
docker compose up -d
docker compose logs -f
docker compose logs -f protocol-assistant
docker restart radiology-protocol-assistant
docker compose up -d --build
docker compose down -v && docker compose up -d
```

### Local Development

```bash
cd gateway && npm install && npm run dev
cd forms-service && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8001
cd protocol-assistant && pip install -r requirements.txt && uvicorn app.main:app --reload --port 8002
cd frontend && npm install && npm run dev
```

### Database Migrations

```bash
docker exec radiology-forms alembic upgrade head
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/002_notification_preferences.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/003_update_files_category_constraint.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/004_add_task_status_history.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/005_add_project_approval_statuses.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/006_add_pgvector_embeddings.sql
./scripts/load-schemas.sh
```

### Linting & Tests

```bash
cd frontend && npm run lint
cd gateway && npm run lint && npm test
```

---

## Quick Reference

### Service Ports

| Service | Host Port |
|---------|-----------|
| Frontend | 5174 |
| Gateway | 3001 |
| Forms Service | 8001 |
| Protocol Assistant | 8002 |
| PostgreSQL | 5434 |

### Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | password123 |
| Reviewer | reviewer@example.com | password123 |
| Researcher | researcher@example.com | password123 |

### Key Environment Variables

- `JWT_SECRET` - Must match across Gateway and Forms Service
- `ANTHROPIC_API_KEY` - Required for Protocol Assistant
- `OPENAI_API_KEY` - Optional fallback LLM
- `INTERNAL_API_KEY` - Service-to-service auth

### Critical Files

- `forms-service/app/services/document.py` - DOCX/PDF generation (handle with care)
- `gateway/src/middleware/auth.ts` - JWT validation
- `protocol-assistant/app/middleware/auth.py` - Header-based service auth

### Debugging

```bash
curl http://localhost:3001/api/health
curl http://localhost:8001/health
curl http://localhost:8002/health
docker exec radiology-db pg_isready -U radiology
docker logs radiology-gateway --tail 50
docker logs radiology-forms --tail 50
docker logs radiology-protocol-assistant --tail 50
```

### API Docs

- Forms Service: http://localhost:8001/docs
- Protocol Assistant: http://localhost:8002/docs
