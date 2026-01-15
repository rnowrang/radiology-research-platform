# Radiology Research Platform

A comprehensive research management platform for IRB forms, research projects, and workflow automation.

## Status

**Current Version**: 1.0.0 (Development)
**Last Updated**: January 14, 2026

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

1. Clone the repository:
   ```bash
   cd /Users/rajamac/dev
   git clone <repository-url> radiology-research-platform
   cd radiology-research-platform
   ```

2. Copy environment file (optional):
   ```bash
   cp .env.example .env
   ```

3. Start all services:
   ```bash
   docker-compose up -d
   ```

4. Wait for services to initialize (~60 seconds), then access:
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
- Task and notification management
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
- Form review workflow

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

## Troubleshooting

### Database connection failed
```bash
docker-compose logs db
docker exec radiology-db pg_isready -U radiology
```

### Forms Service won't start
Check for `postgres://` vs `postgresql://` in DATABASE_URL.

### PDF generation fails
Verify LibreOffice is installed in container:
```bash
docker exec radiology-forms which soffice
```

## License

Proprietary - All rights reserved.

---

*For development history and detailed progress, see [docs/DEVELOPMENT_LOG.md](docs/DEVELOPMENT_LOG.md)*
