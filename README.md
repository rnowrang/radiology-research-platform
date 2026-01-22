# Radiology Research Platform

A comprehensive research management platform for IRB forms, research projects, and workflow automation. The platform provides end-to-end support for the research lifecycle including form management, multi-stage review workflows, task automation, real-time collaboration, and HIPAA-compliant audit logging.

## Status

**Current Version**: 2.0.0 (Development)
**Last Updated**: January 15, 2026

## Architecture

The platform uses a microservices architecture with three main components:

- **Gateway Service** (Node.js/Express) - Authentication, user management, projects, tasks, audit logging
- **Forms Service** (Python/FastAPI) - Form templates, form data, DOCX/PDF generation
- **Frontend** (React/Vite) - Modern UI with Tailwind CSS and shadcn/ui components

For detailed architecture information, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Quick Start

### Prerequisites

- Docker Desktop 4.x+
- Docker Compose 2.x+
- 8GB RAM minimum

### Running with Docker

```bash
# 1. Clone and configure
git clone <repository-url> radiology-research-platform
cd radiology-research-platform
cp .env.example .env

# 2. Start services
docker compose up -d

# 3. Wait for database (IMPORTANT - first run takes 30-60 seconds)
sleep 30
docker exec radiology-db pg_isready -U radiology

# 4. Apply Alembic migrations (CRITICAL)
docker exec radiology-forms alembic upgrade head

# 5. Apply SQL migrations (CRITICAL)
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/002_notification_preferences.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/003_update_files_category_constraint.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/004_add_task_status_history.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/005_add_project_approval_statuses.sql

# 6. Load form schemas (CRITICAL)
./scripts/load-schemas.sh

# 7. Verify deployment
docker compose ps
curl http://localhost:3001/api/health
```

After successful deployment, access:
   - **Frontend**: http://localhost:5174
   - **Gateway API**: http://localhost:3001/api
   - **Forms Service API**: http://localhost:8001
   - **Forms API Docs**: http://localhost:8001/docs

### Default Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | password123 |
| Reviewer | reviewer@example.com | password123 |
| Researcher | researcher@example.com | password123 |

## Documentation

| Document | Description |
|----------|-------------|
| [DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md) | Development history and progress tracking |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and design |
| [TECHNOLOGY_STACK.md](docs/TECHNOLOGY_STACK.md) | Complete technology reference |
| [SECURITY.md](docs/SECURITY.md) | Security measures and compliance |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | API endpoint documentation |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment and operations guide |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Database schema reference |

## Project Structure

```
radiology-research-platform/
├── gateway/              # Node.js API Gateway Service
│   ├── src/
│   │   ├── middleware/   # Auth, audit, rate limiting
│   │   ├── routes/       # API routes
│   │   ├── services/     # Business logic
│   │   └── controllers/  # Request handlers
│   └── Dockerfile.dev
├── forms-service/        # Python FastAPI Forms Service
│   ├── app/
│   │   ├── routers/      # API endpoints
│   │   ├── services/     # Document generation (CRITICAL)
│   │   ├── models/       # SQLAlchemy models
│   │   └── data/schemas/ # JSON form schemas
│   └── Dockerfile.dev
├── frontend/             # React Frontend Application
│   ├── src/
│   │   ├── components/   # UI components (shadcn/ui)
│   │   ├── pages/        # Page components
│   │   ├── stores/       # Zustand state
│   │   └── lib/          # Utilities
│   └── Dockerfile.dev
├── database/             # Database setup
│   ├── schema.sql        # Full database schema
│   └── seeds.sql         # Test data
├── storage/              # File storage
│   ├── templates/        # DOCX templates (5 files)
│   ├── uploads/          # User uploads
│   └── generated/        # Generated documents
├── docs/                 # Documentation
├── nginx/                # NGINX config (production)
├── docker-compose.yml    # Development orchestration
└── .env.example          # Environment template
```

## Services

### Gateway Service (Port 3001)

**Technology**: Node.js 18, Express 4, TypeScript

**Handles**:
- JWT authentication and session management
- User registration and profile management
- Role-based access control (admin, reviewer, researcher)
- Research project CRUD operations
- Task workflow system with auto-task creation
- Task review workflow (submit, approve, reject, request revision)
- Real-time notification delivery
- Email notification system
- Global search across forms, projects, and users
- Editing locks for concurrent edit prevention
- Activity feed tracking
- User management admin functions
- HIPAA-compliant audit logging
- Proxying form-related requests to Forms Service

### Forms Service (Port 8001)

**Technology**: Python 3.11, FastAPI, SQLAlchemy

**Handles**:
- Form template management
- Dynamic form rendering schemas (JSON)
- Form data storage and versioning
- DOCX template filling with python-docx
- PDF generation via LibreOffice
- Multi-stage form review workflow
- Amendment system for post-approval changes
- File upload and management
- @mention processing in comments
- Reports and analytics data generation

**Critical Component**: `forms-service/app/services/document.py`
- 1200+ lines of document generation logic
- Handles legacy FORMCHECKBOX fields
- Must be preserved exactly as-is

### Frontend (Port 5174)

**Technology**: React 18, Vite 5, TypeScript, Tailwind CSS

**Features**:
- Modern, professional UI with shadcn/ui components
- Dynamic form rendering from JSON schemas
- Real-time form autosaving with debouncing
- Collapsible sections with progress tracking
- Review workflow interface
- Role-based navigation
- Global search with filters
- Real-time notifications
- Activity feeds
- File management with drag-and-drop upload
- Task workflow management
- Admin configuration panels
- Reports and analytics dashboards
- @mention support in comments
- Editing lock indicators

## Development

### Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f forms-service

# Stop all services
docker-compose down

# Rebuild after code changes
docker-compose up -d --build

# Reset database (WARNING: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Local Development (Without Docker)

1. Start the database:
   ```bash
   docker-compose up -d db
   ```

2. Start Gateway Service:
   ```bash
   cd gateway
   npm install
   npm run dev
   ```

3. Start Forms Service:
   ```bash
   cd forms-service
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8001
   ```

4. Start Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

## Security & Compliance

### HIPAA Compliance

- All actions logged to append-only audit table
- Role-based access control
- Session management with automatic timeout
- Account lockout after 5 failed attempts (30 min)
- Password requirements (8+ chars, mixed case, numbers)

### SOC 2 Trust Service Criteria

- **Security**: Authentication, authorization, encryption
- **Availability**: Health checks, auto-restart
- **Confidentiality**: Access controls, audit logging
- **Processing Integrity**: Validation, versioning
- **Privacy**: Data minimization, consent tracking

For detailed security information, see [docs/SECURITY.md](docs/SECURITY.md).

## API Documentation

- **Forms Service Swagger UI**: http://localhost:8001/docs
- **Forms Service ReDoc**: http://localhost:8001/redoc
- **API Reference**: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

## Environment Variables

Key environment variables (see `.env.example` for full list):

| Variable | Description | Default |
|----------|-------------|---------|
| DB_USER | Database username | radiology |
| DB_PASSWORD | Database password | radiology_secret |
| JWT_SECRET | JWT signing secret | (generate secure key) |
| CORS_ORIGIN | Allowed CORS origin | http://localhost:5174 |
| SMTP_HOST | Email server hostname | localhost |
| SMTP_PORT | Email server port | 587 |
| SMTP_USER | Email server username | (optional) |
| SMTP_PASSWORD | Email server password | (optional) |
| SMTP_FROM | Default from address | noreply@example.com |
| UPLOAD_MAX_SIZE_MB | Maximum file upload size | 50 |
| EDITING_LOCK_TTL_MINUTES | Editing lock timeout | 5 |
| SEARCH_RESULTS_LIMIT | Max search results | 100 |

## Troubleshooting

### Database connection failed
```bash
docker-compose logs db
docker exec radiology-db pg_isready -U radiology
```

### Missing tables or columns
Run all migrations in order:
```bash
docker exec radiology-forms alembic upgrade head
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/002_notification_preferences.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/003_update_files_category_constraint.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/004_add_task_status_history.sql
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/005_add_project_approval_statuses.sql
```

### Empty form templates
Load the form schemas:
```bash
./scripts/load-schemas.sh
```

### Forms Service won't start
Check for `postgres://` vs `postgresql://` in DATABASE_URL.

### PDF generation fails
Verify LibreOffice is installed in the forms-service container:
```bash
docker exec radiology-forms which soffice
```

### Authentication errors
Verify `JWT_SECRET` is consistent across all services (gateway and forms-service). Both services must use the same secret for token validation.

## License

Proprietary - All rights reserved.

---

*For development history and detailed progress, see [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)*
