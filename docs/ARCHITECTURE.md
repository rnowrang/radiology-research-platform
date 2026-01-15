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
6. **Collaboration**: form_collaborators, comment_threads, comments, comment_mentions
7. **Amendments**: amendments, amendment_field_changes
8. **Files**: files
9. **Tasks**: tasks, task_definitions, task_project_type_mappings
10. **Notifications**: notifications, notification_preferences
11. **Activity**: activities, editing_locks
12. **Search**: search indexes (GIN), search_vector columns
13. **Audit**: audit_logs (append-only)

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

| Component | Frontend | Gateway | Forms Service | Database | File Storage | Email Service |
|-----------|----------|---------|---------------|----------|--------------|---------------|
| Frontend | - | HTTP/REST | - | - | - | - |
| Gateway | - | - | HTTP/REST | PostgreSQL | Read | SMTP |
| Forms Service | - | - | - | PostgreSQL | Read/Write | - |
| Database | - | - | - | - | - | - |
| File Storage | - | - | - | - | - | - |
| Email Service | - | - | - | - | - | - |

---

## Task Workflow System Architecture

### Overview

The Task Workflow System automates task creation and management based on project types, ensuring consistent compliance and documentation requirements across all research projects.

### Auto-Task Creation Flow

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   User      │────▶│  Create Project  │────▶│  Project Type   │
│   Action    │     │  (with type)     │     │  Detection      │
└─────────────┘     └──────────────────┘     └────────┬────────┘
                                                      │
                                                      ▼
                    ┌──────────────────────────────────────────────┐
                    │         Task Definition Lookup               │
                    │                                              │
                    │  Project Type ──▶ Task Template Mappings     │
                    │                                              │
                    │  Standard IRB:                               │
                    │    - Protocol Documentation                  │
                    │    - Consent Form Review                     │
                    │    - Ethics Training Verification            │
                    │    - Data Management Plan                    │
                    │                                              │
                    │  Minimal Risk:                               │
                    │    - Abbreviated Protocol                    │
                    │    - Consent Form Review                     │
                    │    - Training Verification                   │
                    └──────────────────┬───────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Task Generation Engine                         │
│                                                                   │
│  For each mapped task:                                           │
│    1. Create task instance                                       │
│    2. Calculate due date (project start + offset)                │
│    3. Assign to default assignee (owner/department admin)        │
│    4. Set priority based on template                             │
│    5. Create notification for assignee                           │
└──────────────────────────────────────┬───────────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────┐
                    │       Tasks Table (Database)      │
                    │                                   │
                    │  - task_id                        │
                    │  - project_id                     │
                    │  - task_definition_id             │
                    │  - assignee_id                    │
                    │  - status (pending/in_progress/   │
                    │           submitted/approved/     │
                    │           rejected/revision)      │
                    │  - due_date                       │
                    │  - submitted_at                   │
                    │  - reviewed_at                    │
                    └──────────────────────────────────┘
```

### Task Review Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Pending   │────▶│ In Progress │────▶│  Submitted  │────▶│  Approved   │
└─────────────┘     └─────────────┘     └──────┬──────┘     └─────────────┘
                                               │
                                               │ Review Decision
                                               │
                           ┌───────────────────┼───────────────────┐
                           │                   │                   │
                           ▼                   ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │  Approved   │     │  Rejected   │     │  Revision   │
                    │             │     │  (Terminal) │     │  Requested  │
                    └─────────────┘     └─────────────┘     └──────┬──────┘
                                                                   │
                                                                   │ User Revises
                                                                   │
                                                                   ▼
                                                           ┌─────────────┐
                                                           │  Submitted  │
                                                           │  (Again)    │
                                                           └─────────────┘
```

### Task Data Model

```
task_definitions                    task_project_type_mappings
┌────────────────────┐              ┌────────────────────┐
│ id                 │              │ id                 │
│ name               │◀─────────────│ task_definition_id │
│ description        │              │ project_type       │
│ category           │              │ is_required        │
│ default_priority   │              │ due_date_offset    │
│ estimated_duration │              │ sort_order         │
│ required_fields    │              └────────────────────┘
└────────────────────┘
         │
         │
         ▼
tasks
┌────────────────────┐
│ id                 │
│ project_id         │
│ task_definition_id │
│ assignee_id        │
│ reviewer_id        │
│ status             │
│ priority           │
│ due_date           │
│ submission_data    │
│ review_comments    │
│ submitted_at       │
│ reviewed_at        │
│ created_at         │
│ updated_at         │
└────────────────────┘
```

---

## Notification System Flow

### Notification Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Event Sources                                     │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Form    │  │  Review  │  │  Task    │  │ Comment  │  │  System  │  │
│  │  Events  │  │  Events  │  │  Events  │  │  Events  │  │  Events  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │             │             │             │             │         │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────┘
        │             │             │             │             │
        └─────────────┴─────────────┴──────┬──────┴─────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │  Notification Service  │
                              │                        │
                              │  - Event processing    │
                              │  - Recipient lookup    │
                              │  - Preference check    │
                              │  - Deduplication       │
                              └───────────┬────────────┘
                                          │
                    ┌─────────────────────┼─────────────────────┐
                    │                     │                     │
                    ▼                     ▼                     ▼
           ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
           │  In-App       │     │  Email        │     │  (Future)     │
           │  Notification │     │  Notification │     │  Push/SMS     │
           └───────────────┘     └───────────────┘     └───────────────┘
```

### Notification Types

| Type | Trigger | Recipients | Delivery |
|------|---------|------------|----------|
| review_assigned | Review assigned to user | Assignee | In-app, Email |
| review_completed | Review action taken | Form owner, collaborators | In-app, Email |
| task_assigned | Task created/assigned | Assignee | In-app, Email |
| task_due_soon | Task due within 24h | Assignee | In-app, Email |
| task_overdue | Task past due date | Assignee, Admin | In-app, Email |
| mention | User @mentioned | Mentioned user | In-app, Email |
| comment_added | New comment on form | Form owner, collaborators | In-app |
| form_submitted | Form submitted for review | Reviewers | In-app, Email |
| amendment_requested | Amendment filed | Reviewers | In-app, Email |
| system_alert | System maintenance, etc. | All users | In-app |

---

## File Storage Architecture

### Storage Layout

```
storage/
├── templates/                    # DOCX form templates (read-only)
│   ├── IRB_v6.docx
│   ├── irb-application-standard.docx
│   ├── irb-application-minimal-risk.docx
│   ├── irb-application-archival.docx
│   └── irb-application-anonymous-survey.docx
│
├── uploads/                      # User-uploaded files
│   ├── {project_id}/
│   │   ├── {form_id}/
│   │   │   ├── {file_uuid}.{ext}
│   │   │   └── ...
│   │   └── attachments/
│   │       └── {file_uuid}.{ext}
│   └── ...
│
└── generated/                    # System-generated documents
    ├── {form_id}/
    │   ├── v{version}_{timestamp}.docx
    │   ├── v{version}_{timestamp}.pdf
    │   └── ...
    └── reports/
        └── {report_type}_{date}.{ext}
```

### File Upload Flow

```
┌─────────┐     ┌─────────┐     ┌───────────────┐     ┌──────────────┐
│ Browser │────▶│ Gateway │────▶│ Forms Service │────▶│ File System  │
└─────────┘     └─────────┘     └───────────────┘     └──────────────┘
     │               │                  │                    │
     │  1. POST      │  2. Validate     │                    │
     │  multipart/   │  - Auth          │                    │
     │  form-data    │  - File type     │                    │
     │               │  - File size     │                    │
     │               │                  │                    │
     │               │  3. Forward      │                    │
     │               │  ────────────────▶                    │
     │               │                  │  4. Generate UUID  │
     │               │                  │  5. Validate type  │
     │               │                  │  6. Scan (future)  │
     │               │                  │                    │
     │               │                  │  7. Save to disk   │
     │               │                  │  ────────────────▶ │
     │               │                  │                    │
     │               │                  │  8. Create DB      │
     │               │                  │     record         │
     │               │                  │                    │
     │  9. Return    │◀─────────────────│                    │
     │  file metadata│                  │                    │
     │◀──────────────│                  │                    │
```

### File Database Schema

```
files
┌────────────────────────┐
│ id (UUID)              │
│ project_id             │
│ form_id (nullable)     │
│ uploaded_by            │
│ original_filename      │
│ stored_filename        │
│ file_path              │
│ mime_type              │
│ file_size              │
│ checksum (SHA-256)     │
│ version                │
│ is_deleted             │
│ created_at             │
│ updated_at             │
└────────────────────────┘
```

---

## Search System Architecture

### Search Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Frontend Search UI                              │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Global Search Bar                                                  │ │
│  │  ┌──────────────────────────────────────────┐ ┌─────────────────┐  │ │
│  │  │ Search forms, projects, users...         │ │ Filters ▼       │  │ │
│  │  └──────────────────────────────────────────┘ └─────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Debounced Query (300ms)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Gateway Service                                │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Search Controller                             │    │
│  │                                                                  │    │
│  │  - Parse query and filters                                      │    │
│  │  - Validate user permissions                                    │    │
│  │  - Route to appropriate search services                         │    │
│  │  - Aggregate and rank results                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
             ┌───────────┐  ┌───────────┐  ┌───────────┐
             │  Project  │  │   Form    │  │   User    │
             │  Search   │  │  Search   │  │  Search   │
             └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
                   │              │              │
                   └──────────────┼──────────────┘
                                  │
                                  ▼
                    ┌─────────────────────────────┐
                    │      PostgreSQL Database    │
                    │                             │
                    │  - Full-text search (GIN)   │
                    │  - ILIKE pattern matching   │
                    │  - tsvector/tsquery         │
                    └─────────────────────────────┘
```

### Search Query Processing

```sql
-- Example: Full-text search across forms
SELECT f.id, f.title, f.status,
       ts_rank(f.search_vector, query) AS rank
FROM form_instances f,
     to_tsquery('english', 'cancer & research') query
WHERE f.search_vector @@ query
  AND f.project_id IN (SELECT project_id FROM project_collaborators WHERE user_id = ?)
ORDER BY rank DESC
LIMIT 20;
```

### Search Result Types

| Type | Searchable Fields | Filters |
|------|-------------------|---------|
| Projects | title, description, PI name | status, type, date range |
| Forms | title, form data (JSON), template name | status, template, reviewer |
| Users | name, email, department | role, status |
| Comments | content, author | date range |

---

## Real-time Features

### Editing Locks Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Editing Lock Flow                                    │
│                                                                          │
│  User A opens form                  User B tries to open same form      │
│        │                                      │                          │
│        ▼                                      ▼                          │
│  ┌───────────────┐                    ┌───────────────┐                 │
│  │ Request Lock  │                    │ Request Lock  │                 │
│  └───────┬───────┘                    └───────┬───────┘                 │
│          │                                    │                          │
│          ▼                                    ▼                          │
│  ┌───────────────┐                    ┌───────────────┐                 │
│  │ Check Lock    │                    │ Check Lock    │                 │
│  │ Status        │                    │ Status        │                 │
│  └───────┬───────┘                    └───────┬───────┘                 │
│          │                                    │                          │
│          │ No existing lock                   │ Lock exists (User A)    │
│          │                                    │                          │
│          ▼                                    ▼                          │
│  ┌───────────────┐                    ┌───────────────┐                 │
│  │ Grant Lock    │                    │ Deny Lock     │                 │
│  │ (5 min TTL)   │                    │ Return holder │                 │
│  └───────┬───────┘                    │ info          │                 │
│          │                            └───────────────┘                 │
│          ▼                                                              │
│  ┌───────────────┐                                                      │
│  │ Start         │                                                      │
│  │ Heartbeat     │◀─────── Every 60 seconds ──────┐                    │
│  │ (renew lock)  │                                │                    │
│  └───────┬───────┘                                │                    │
│          │                                        │                    │
│          └────────────────────────────────────────┘                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Lock Database Schema

```
editing_locks
┌────────────────────────┐
│ id                     │
│ form_id                │
│ user_id                │
│ locked_at              │
│ expires_at             │
│ heartbeat_at           │
└────────────────────────┘
```

### Lock API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/forms/{id}/lock` | POST | Acquire editing lock |
| `/forms/{id}/lock` | DELETE | Release editing lock |
| `/forms/{id}/lock/heartbeat` | PUT | Renew lock TTL |
| `/forms/{id}/lock/status` | GET | Check current lock status |

### Activity Feeds Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Activity Event Sources                               │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Form    │  │  Review  │  │  Task    │  │  File    │  │ Comment  │  │
│  │  CRUD    │  │  Actions │  │  Updates │  │  Upload  │  │  Posts   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼─────────┘
        │             │             │             │             │
        └─────────────┴─────────────┴──────┬──────┴─────────────┘
                                           │
                                           ▼
                              ┌────────────────────────┐
                              │   Activity Logger      │
                              │                        │
                              │  - Capture event       │
                              │  - Extract metadata    │
                              │  - Associate entities  │
                              │  - Store in database   │
                              └───────────┬────────────┘
                                          │
                                          ▼
                              ┌────────────────────────┐
                              │   activities table     │
                              │                        │
                              │  - id                  │
                              │  - project_id          │
                              │  - form_id (nullable)  │
                              │  - user_id             │
                              │  - action_type         │
                              │  - entity_type         │
                              │  - entity_id           │
                              │  - metadata (JSON)     │
                              │  - created_at          │
                              └────────────────────────┘
```

### Activity Feed Query

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Project Activity Feed                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Today                                                           │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  [Avatar] John Smith submitted form "IRB-2026-001" for review   │    │
│  │           2 hours ago                                            │    │
│  │                                                                  │    │
│  │  [Avatar] Jane Doe uploaded file "consent_form_v2.pdf"          │    │
│  │           3 hours ago                                            │    │
│  │                                                                  │    │
│  │  Yesterday                                                       │    │
│  │  ─────────────────────────────────────────────────────────────  │    │
│  │  [Avatar] Admin User approved task "Protocol Documentation"     │    │
│  │           Yesterday at 4:30 PM                                   │    │
│  │                                                                  │    │
│  │  [Avatar] John Smith mentioned @Jane Doe in a comment           │    │
│  │           Yesterday at 2:15 PM                                   │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

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

*Last Updated: January 15, 2026*
