# System Architecture

This document describes the architecture of the Radiology Research Platform.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                        │
│                                                                                  │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐           │
│    │   Web Browser   │    │   Mobile App    │    │   API Client    │           │
│    │   (React SPA)   │    │    (Future)     │    │    (Future)     │           │
│    └────────┬────────┘    └────────┬────────┘    └────────┬────────┘           │
│             │                      │                      │                     │
└─────────────┼──────────────────────┼──────────────────────┼─────────────────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │ HTTPS
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Load Balancer / Reverse Proxy                          │
│                              (NGINX - Future)                                    │
│                         SSL Termination, Rate Limiting                           │
└────────────────────────────────────┬────────────────────────────────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Frontend Service  │  │   Gateway Service   │  │  Forms Service      │
│   (React + Vite)    │  │   (Node.js/Express) │  │  (Python/FastAPI)   │
│                     │  │                     │  │                     │
│   Port: 5174        │  │   Port: 3001        │  │   Port: 8001        │
│                     │  │                     │  │                     │
│   - Static Assets   │  │   - Authentication  │  │   - Form Templates  │
│   - SPA Routing     │  │   - Authorization   │  │   - Form CRUD       │
│   - API Calls       │  │   - Audit Logging   │  │   - Document Gen    │
│                     │  │   - Rate Limiting   │  │   - PDF Export      │
│                     │  │   - User Management │  │   - Version Control │
│                     │  │   - Project Mgmt    │  │                     │
│                     │  │   - Forms Proxy     │  │                     │
└─────────────────────┘  └──────────┬──────────┘  └──────────┬──────────┘
                                    │                        │
                                    │    Internal Network    │
                                    │    (Docker Bridge)     │
                                    │                        │
                                    └───────────┬────────────┘
                                                │
                                                ▼
                              ┌─────────────────────────────────┐
                              │         PostgreSQL 15           │
                              │                                 │
                              │   Port: 5434                    │
                              │                                 │
                              │   - Users & Sessions            │
                              │   - Projects                    │
                              │   - Form Templates              │
                              │   - Form Instances              │
                              │   - Review Workflow             │
                              │   - Audit Logs                  │
                              │                                 │
                              └─────────────────────────────────┘
```

---

## Service Responsibilities

### 1. Frontend Service (React SPA)

**Purpose**: User interface for the entire platform

**Responsibilities**:
- Render dynamic forms from JSON schemas
- Handle user authentication flow
- Manage local state (Zustand)
- Make API calls to Gateway
- Display notifications and feedback
- Handle file uploads/downloads

**Key Technologies**:
- React 18 with TypeScript
- Tailwind CSS + shadcn/ui
- React Router v6
- TanStack Query
- React Hook Form + Zod

**Communication**:
- Outbound: HTTP/HTTPS to Gateway API
- No direct database access
- No direct access to Forms Service

---

### 2. Gateway Service (Node.js/Express)

**Purpose**: API gateway, authentication, and business logic hub

**Responsibilities**:
- JWT authentication and session management
- Role-based access control (RBAC)
- HIPAA-compliant audit logging
- Rate limiting and security headers
- User and project management
- Proxy requests to Forms Service
- Email notifications (future)

**Key Technologies**:
- Express.js with TypeScript
- JWT (jsonwebtoken)
- bcrypt for password hashing
- Winston for logging
- Helmet for security headers
- pg (node-postgres) for database

**Communication**:
- Inbound: HTTP from Frontend/clients
- Outbound: HTTP to Forms Service (internal)
- Database: Direct PostgreSQL connection

---

### 3. Forms Service (Python/FastAPI)

**Purpose**: Form management and document generation

**Responsibilities**:
- Template storage and retrieval
- Form instance CRUD operations
- Field data persistence and autosave
- Version control (immutable snapshots)
- DOCX template filling (python-docx)
- PDF generation (LibreOffice)
- Conditional field logic

**Key Technologies**:
- FastAPI with Python 3.11
- SQLAlchemy ORM
- python-docx for DOCX manipulation
- LibreOffice for PDF conversion
- Pydantic for validation

**Communication**:
- Inbound: HTTP from Gateway (internal)
- Database: Direct PostgreSQL connection
- File System: Read/write to storage volume

**Critical Component**: `document.py`
- 1200+ lines of DOCX/PDF generation logic
- Handles legacy FORMCHECKBOX XML elements
- Must be preserved exactly as-is

---

### 4. PostgreSQL Database

**Purpose**: Persistent data storage

**Responsibilities**:
- Store all application data
- Enforce referential integrity
- Support concurrent access
- Enable complex queries

**Schema Categories**:
1. **Identity & Auth**: users, sessions
2. **Projects**: projects, project_collaborators
3. **Templates**: templates (with JSON schema)
4. **Forms**: form_instances, form_data, form_versions
5. **Review**: review_stages, form_reviews, review_actions
6. **Collaboration**: form_collaborators, comment_threads, comments
7. **Amendments**: amendments, amendment_field_changes
8. **Files**: files
9. **Tasks**: tasks, notifications
10. **Audit**: audit_logs (append-only)

---

## Data Flow Diagrams

### Authentication Flow

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌────────────┐
│ Browser │────▶│ Gateway │────▶│ Database │────▶│   Return   │
└─────────┘     └─────────┘     └──────────┘     │ JWT Tokens │
                                                 └────────────┘
     │               │               │
     │  1. POST      │  2. Verify    │
     │  /auth/login  │  credentials  │
     │  {email,pass} │  (bcrypt)     │
     │               │               │
     │               │  3. Create    │
     │               │  session      │
     │               │               │
     │  4. Return    │◀──────────────│
     │  {accessToken,│
     │   refreshToken│
     │   user}       │
     │◀──────────────│
```

### Form Submission Flow

```
┌─────────┐     ┌─────────┐     ┌───────────┐     ┌──────────┐
│ Browser │────▶│ Gateway │────▶│  Forms    │────▶│ Database │
└─────────┘     └─────────┘     │  Service  │     └──────────┘
                                └───────────┘
     │               │               │               │
     │  1. POST      │  2. Verify    │               │
     │  /forms/{id}  │  JWT token    │               │
     │  /data        │               │               │
     │  {fieldData}  │  3. Forward   │               │
     │               │  to Forms     │               │
     │               │  Service      │  4. Save      │
     │               │  ────────────▶│  form_data   │
     │               │               │  ────────────▶│
     │               │               │               │
     │               │               │  5. Log       │
     │               │               │  field_change │
     │               │               │  ────────────▶│
     │               │               │               │
     │  6. Return    │◀──────────────│◀──────────────│
     │  {success}    │               │               │
     │◀──────────────│               │               │
```

### Document Generation Flow

```
┌─────────┐     ┌─────────┐     ┌───────────┐     ┌──────────────┐
│ Browser │────▶│ Gateway │────▶│  Forms    │────▶│ File System  │
└─────────┘     └─────────┘     │  Service  │     └──────────────┘
                                └───────────┘
     │               │               │               │
     │  1. POST      │  2. Verify    │               │
     │  /forms/{id}  │  JWT          │               │
     │  /export      │               │               │
     │               │  3. Forward   │               │
     │               │  ────────────▶│               │
     │               │               │  4. Load      │
     │               │               │  DOCX template│
     │               │               │◀──────────────│
     │               │               │               │
     │               │               │  5. Fill      │
     │               │               │  template     │
     │               │               │  (python-docx)│
     │               │               │               │
     │               │               │  6. Convert   │
     │               │               │  to PDF       │
     │               │               │  (LibreOffice)│
     │               │               │               │
     │               │               │  7. Save      │
     │               │               │  generated/   │
     │               │               │  ────────────▶│
     │               │               │               │
     │  8. Return    │◀──────────────│               │
     │  download URL │               │               │
     │◀──────────────│               │               │
```

---

## Network Architecture

### Docker Network (Development)

```
┌─────────────────────────────────────────────────────────────┐
│                 radiology-network (bridge)                   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ radiology-db │  │  radiology-  │  │  radiology-  │       │
│  │              │  │   gateway    │  │    forms     │       │
│  │ 172.20.0.2   │  │ 172.20.0.3   │  │ 172.20.0.4   │       │
│  │ :5432        │  │ :3000        │  │ :8000        │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐                                           │
│  │  radiology-  │                                           │
│  │   frontend   │                                           │
│  │ 172.20.0.5   │                                           │
│  │ :5173        │                                           │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Port Mappings
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     Host Machine                             │
│                                                              │
│   localhost:5434 ──▶ db:5432                                │
│   localhost:3001 ──▶ gateway:3000                           │
│   localhost:8001 ──▶ forms-service:8000                     │
│   localhost:5174 ──▶ frontend:5173                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Production Architecture (Future)

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cloud Load Balancer                       │
│                    (SSL Termination)                         │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Frontend CDN   │ │ Gateway Cluster │ │ Forms Cluster   │
│                 │ │   (2+ nodes)    │ │   (2+ nodes)    │
│  Static Assets  │ │   Auto-scaling  │ │   Auto-scaling  │
└─────────────────┘ └────────┬────────┘ └────────┬────────┘
                             │                   │
                             └─────────┬─────────┘
                                       │
                                       ▼
                    ┌─────────────────────────────────┐
                    │    PostgreSQL (Primary/Replica) │
                    │         + Redis Cache           │
                    │       + S3 File Storage         │
                    └─────────────────────────────────┘
```

---

## Component Interaction Matrix

| Component | Frontend | Gateway | Forms Service | Database | File Storage |
|-----------|----------|---------|---------------|----------|--------------|
| Frontend | - | HTTP/REST | - | - | - |
| Gateway | - | - | HTTP/REST | PostgreSQL | Read |
| Forms Service | - | - | - | PostgreSQL | Read/Write |
| Database | - | - | - | - | - |
| File Storage | - | - | - | - | - |

---

## Scalability Considerations

### Horizontal Scaling

1. **Frontend**: Stateless, scales infinitely behind CDN
2. **Gateway**: Stateless (JWT), scales behind load balancer
3. **Forms Service**: Stateless, scales behind load balancer
4. **Database**: Primary/replica setup, read replicas for queries

### Vertical Scaling

1. **Forms Service**: PDF generation is CPU-intensive
   - Consider dedicated worker processes
   - Queue-based document generation

### Caching Strategy (Future)

1. **Redis** for:
   - Session data
   - Rate limiting counters
   - Template schema caching
   - User permissions caching

---

## Failure Modes and Recovery

### Database Failure
- Gateway returns 503 Service Unavailable
- Forms Service returns 503 Service Unavailable
- Frontend shows error state
- **Recovery**: Automatic reconnection with exponential backoff

### Forms Service Failure
- Gateway returns 502 Bad Gateway for form operations
- Other operations (auth, projects) continue to work
- **Recovery**: Docker auto-restart, health checks

### Gateway Failure
- Frontend cannot make API calls
- Direct Forms Service access blocked (no auth)
- **Recovery**: Docker auto-restart, health checks

### File Storage Failure
- Document generation fails
- Existing documents inaccessible
- **Recovery**: Volume remount, backup restoration

---

*Last Updated: January 14, 2026*
