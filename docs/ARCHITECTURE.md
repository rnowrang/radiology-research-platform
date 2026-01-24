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
│                     │  │   - Protocol Proxy  │  │                     │
└─────────────────────┘  └──────────┬──────────┘  └──────────┬──────────┘
                                    │                        │
                                    │    Internal Network    │
                                    │    (Docker Bridge)     │
                                    │                        │
              ┌─────────────────────┼────────────────────────┘
              │                     │
              ▼                     ▼
┌─────────────────────┐  ┌─────────────────────┐
│ Protocol Assistant  │  │    PostgreSQL 15    │
│ (Python/FastAPI)    │  │                     │
│                     │  │   Port: 5434        │
│ Port: 8002          │  │                     │
│                     │  │   - Users/Sessions  │
│ - Chat Sessions     │  │   - Projects        │
│ - Document Parsing  │  │   - Form Templates  │
│ - Protocol Extract  │  │   - Form Instances  │
│ - Doc Generation    │  │   - Review Workflow │
│ - LLM Integration   │  │   - Audit Logs      │
│                     │  │   - Chat Sessions   │
└──────────┬──────────┘  │   - Protocol Drafts │
           │             │                     │
           └─────────────▶─────────────────────┘
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
- Proxy requests to Protocol Assistant
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
- Outbound: HTTP to Protocol Assistant (internal)
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

### 4. Protocol Assistant Service (Python/FastAPI)

**Purpose**: AI-powered IRB protocol creation assistant

**Responsibilities**:
- Manage chat sessions for protocol assistance
- Parse and analyze uploaded research documents
- Extract protocol information from documents
- Generate draft protocol documents
- Route tasks to appropriate LLM providers
- Maintain conversation context and history

**Key Technologies**:
- FastAPI with Python 3.11
- AsyncPG for async database operations
- Claude SDK (Anthropic) for complex reasoning
- OpenAI SDK for document processing
- Pydantic for validation
- Document parsing libraries (PyPDF2, python-docx)

**Key Features**:
- **Chat Sessions**: Persistent conversation threads for protocol development
- **Document Parsing**: Extract text and structure from PDFs, DOCX files
- **Protocol Extraction**: Identify key protocol elements from research documents
- **Document Generation**: Create draft IRB protocols from extracted information
- **LLM Integration**: Task-based routing between Claude and OpenAI models

**LLM Integration Strategy**:
- Claude: Complex reasoning, protocol analysis, research comprehension
- OpenAI: Document summarization, structured data extraction
- Task router selects optimal model based on task characteristics

**Communication**:
- Inbound: HTTP from Gateway (internal)
- Outbound: HTTPS to Claude API (Anthropic)
- Outbound: HTTPS to OpenAI API
- Database: Direct PostgreSQL connection (AsyncPG)

---

### 5. PostgreSQL Database

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
14. **Protocol Assistant**: chat_sessions, chat_messages, protocol_drafts, extracted_protocols

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

### Protocol Assistant Flow

```
┌─────────┐     ┌─────────┐     ┌───────────────┐     ┌────────────┐
│ Browser │────▶│ Gateway │────▶│   Protocol    │────▶│  LLM APIs  │
└─────────┘     └─────────┘     │   Assistant   │     │ (Claude/   │
                                │   Service     │     │  OpenAI)   │
                                └───────────────┘     └────────────┘
     │               │               │                      │
     │  1. POST      │  2. Verify    │                      │
     │  /protocol/   │  JWT token    │                      │
     │  chat         │               │                      │
     │  {message,    │  3. Forward   │                      │
     │   sessionId}  │  to Protocol  │                      │
     │               │  Assistant    │  4. Route to         │
     │               │  ────────────▶│  appropriate LLM     │
     │               │               │  ─────────────────────▶
     │               │               │                      │
     │               │               │  5. Process          │
     │               │               │  response            │
     │               │               │◀─────────────────────│
     │               │               │                      │
     │               │               │  6. Save to          │
     │               │               │  database            │
     │               │               │  ───────▶ [Database] │
     │               │               │                      │
     │  7. Return    │◀──────────────│                      │
     │  {response,   │               │                      │
     │   sessionId}  │               │                      │
     │◀──────────────│               │                      │

Document Upload Flow:

┌─────────┐     ┌─────────┐     ┌───────────────┐     ┌────────────┐
│ Browser │────▶│ Gateway │────▶│   Protocol    │────▶│  Document  │
└─────────┘     └─────────┘     │   Assistant   │     │  Parser    │
                                └───────────────┘     └────────────┘
     │               │               │                      │
     │  1. POST      │  2. Validate  │                      │
     │  /protocol/   │  file type,   │                      │
     │  upload       │  size         │                      │
     │  (multipart)  │               │                      │
     │               │  3. Forward   │  4. Extract          │
     │               │  ────────────▶│  text content        │
     │               │               │  ─────────────────────▶
     │               │               │                      │
     │               │               │  5. Send to LLM      │
     │               │               │  for extraction      │
     │               │               │  ───────▶ [LLM API]  │
     │               │               │                      │
     │               │               │  6. Store            │
     │               │               │  extracted data      │
     │               │               │  ───────▶ [Database] │
     │               │               │                      │
     │  7. Return    │◀──────────────│                      │
     │  {extracted   │               │                      │
     │   protocol}   │               │                      │
     │◀──────────────│               │                      │
```

---

## Network Architecture

### Docker Network (Development)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     radiology-network (bridge)                           │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ radiology-db │  │  radiology-  │  │  radiology-  │  │  radiology-  │ │
│  │              │  │   gateway    │  │    forms     │  │  protocol    │ │
│  │ 172.20.0.2   │  │ 172.20.0.3   │  │ 172.20.0.4   │  │ 172.20.0.5   │ │
│  │ :5432        │  │ :3000        │  │ :8000        │  │ :8000        │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │
│                                                                          │
│  ┌──────────────┐                                                        │
│  │  radiology-  │                                                        │
│  │   frontend   │                                                        │
│  │ 172.20.0.6   │                                                        │
│  │ :5173        │                                                        │
│  └──────────────┘                                                        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                           │
                           │ Port Mappings
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Host Machine                                    │
│                                                                          │
│   localhost:5434 ──▶ db:5432                                            │
│   localhost:3001 ──▶ gateway:3000                                       │
│   localhost:8001 ──▶ forms-service:8000                                 │
│   localhost:8002 ──▶ protocol-assistant:8000                            │
│   localhost:5174 ──▶ frontend:5173                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Production Architecture (Future)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Internet                                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cloud Load Balancer                               │
│                        (SSL Termination)                                 │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│  Frontend CDN   │  │  Gateway Cluster    │  │  Backend Services   │
│                 │  │    (2+ nodes)       │  │     Cluster         │
│  Static Assets  │  │    Auto-scaling     │  │                     │
└─────────────────┘  └──────────┬──────────┘  │  ┌───────────────┐  │
                                │             │  │ Forms Service │  │
                                │             │  │   (2+ nodes)  │  │
                                │             │  └───────────────┘  │
                                │             │                     │
                                │             │  ┌───────────────┐  │
                                │             │  │   Protocol    │  │
                                │             │  │   Assistant   │  │
                                │             │  │   (2+ nodes)  │  │
                                │             │  └───────────────┘  │
                                │             └──────────┬──────────┘
                                │                        │
                                └────────────┬───────────┘
                                             │
                                             ▼
                    ┌─────────────────────────────────────────┐
                    │    PostgreSQL (Primary/Replica)         │
                    │           + Redis Cache                 │
                    │         + S3 File Storage               │
                    └─────────────────────────────────────────┘
```

---

## Service-to-Service Communication

### Communication Matrix

| Component | Frontend | Gateway | Forms Service | Protocol Assistant | Database | File Storage | LLM APIs |
|-----------|----------|---------|---------------|-------------------|----------|--------------|----------|
| Frontend | - | HTTP/REST | - | - | - | - | - |
| Gateway | - | - | HTTP/REST | HTTP/REST | PostgreSQL | Read | - |
| Forms Service | - | - | - | - | PostgreSQL | Read/Write | - |
| Protocol Assistant | - | - | - | - | PostgreSQL | Read/Write | HTTPS |
| Database | - | - | - | - | - | - | - |
| File Storage | - | - | - | - | - | - | - |
| LLM APIs | - | - | - | - | - | - | - |

### Gateway Proxy Routes

| Route Pattern | Target Service | Description |
|---------------|----------------|-------------|
| `/api/forms/*` | Forms Service (8001) | Form templates and instances |
| `/api/templates/*` | Forms Service (8001) | Template management |
| `/api/export/*` | Forms Service (8001) | Document export |
| `/api/protocol/*` | Protocol Assistant (8002) | Chat and document processing |
| `/api/protocol/chat/*` | Protocol Assistant (8002) | Chat session management |
| `/api/protocol/upload/*` | Protocol Assistant (8002) | Document upload and parsing |
| `/api/protocol/extract/*` | Protocol Assistant (8002) | Protocol extraction |

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
├── protocol/                     # Protocol Assistant files
│   ├── uploads/                  # Uploaded research documents
│   │   └── {session_id}/
│   │       └── {file_uuid}.{ext}
│   └── generated/                # Generated protocol drafts
│       └── {session_id}/
│           └── protocol_draft_{timestamp}.docx
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

## Protocol Assistant Service

### Overview

The Protocol Assistant is an AI-powered service that helps researchers create IRB protocols by analyzing their research documents and guiding them through the protocol creation process via an interactive chat interface.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Protocol Assistant Service                           │
│                     Port: 8002 (host) / 8000 (container)                │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        API Layer (FastAPI)                        │   │
│  │                                                                   │   │
│  │  /chat          - Chat message handling                          │   │
│  │  /sessions      - Session management                             │   │
│  │  /upload        - Document upload                                │   │
│  │  /extract       - Protocol extraction                            │   │
│  │  /generate      - Document generation                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Service Layer                                │   │
│  │                                                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │    Chat     │  │  Document   │  │  Protocol   │              │   │
│  │  │   Service   │  │   Parser    │  │  Extractor  │              │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │   │
│  │         │                │                │                      │   │
│  │         └────────────────┴────────┬───────┘                      │   │
│  │                                   │                              │   │
│  │                                   ▼                              │   │
│  │  ┌─────────────────────────────────────────────────────────┐    │   │
│  │  │                   LLM Task Router                        │    │   │
│  │  │                                                          │    │   │
│  │  │  Task Type          │  Model              │  Use Case    │    │   │
│  │  │  ─────────────────────────────────────────────────────  │    │   │
│  │  │  Complex reasoning  │  Claude (Opus/Sonnet)│  Protocol   │    │   │
│  │  │                     │                      │  analysis   │    │   │
│  │  │  Summarization      │  OpenAI GPT-4       │  Document   │    │   │
│  │  │                     │                      │  summaries  │    │   │
│  │  │  Data extraction    │  OpenAI GPT-4       │  Structured │    │   │
│  │  │                     │                      │  data       │    │   │
│  │  │  Conversation       │  Claude (Sonnet)    │  Chat       │    │   │
│  │  │                     │                      │  responses  │    │   │
│  │  └─────────────────────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│                                    ▼                                     │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Data Layer (AsyncPG)                         │   │
│  │                                                                   │   │
│  │  chat_sessions    │  chat_messages    │  protocol_drafts         │   │
│  │  extracted_data   │  uploaded_files   │  llm_usage_logs          │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

#### 1. Chat Sessions
- Persistent conversation threads for each protocol development effort
- Context-aware responses based on conversation history
- Support for multi-turn conversations with document references

#### 2. Document Parsing
- PDF text extraction (PyPDF2)
- DOCX content parsing (python-docx)
- Table and structure preservation
- Image/figure reference extraction (metadata only)

#### 3. Protocol Extraction
- Identify research objectives from documents
- Extract methodology descriptions
- Recognize participant populations
- Identify risk factors and mitigation strategies
- Detect data handling procedures

#### 4. Document Generation
- Generate draft IRB protocol sections
- Fill standardized protocol templates
- Create summary documents for review

### LLM Integration

#### Task-Based Routing

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM Task Router                                  │
│                                                                          │
│   Incoming Task                                                          │
│        │                                                                 │
│        ▼                                                                 │
│   ┌─────────────────────────────────────────────┐                       │
│   │           Task Classification               │                       │
│   │                                             │                       │
│   │   - Analyze task requirements               │                       │
│   │   - Check context length                    │                       │
│   │   - Evaluate complexity                     │                       │
│   └─────────────────────────────────────────────┘                       │
│        │                                                                 │
│        ├─────────────────────┬──────────────────┐                       │
│        │                     │                  │                       │
│        ▼                     ▼                  ▼                       │
│   ┌─────────┐          ┌─────────┐        ┌─────────┐                  │
│   │ Claude  │          │ OpenAI  │        │  Local  │                  │
│   │  API    │          │  API    │        │ (Future)│                  │
│   └─────────┘          └─────────┘        └─────────┘                  │
│        │                     │                  │                       │
│        └─────────────────────┴──────────────────┘                       │
│                              │                                           │
│                              ▼                                           │
│                    Response Processing                                   │
│                              │                                           │
│                              ▼                                           │
│                    Return to Caller                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Model Selection Criteria

| Criteria | Claude (Anthropic) | OpenAI GPT-4 |
|----------|-------------------|--------------|
| Complex reasoning | Primary | Fallback |
| Long context | Primary (200K) | Secondary |
| Structured extraction | Secondary | Primary |
| Cost-sensitive tasks | Secondary | Primary |
| Research analysis | Primary | Secondary |

### Database Schema (Protocol Assistant)

```
chat_sessions
┌────────────────────────┐
│ id (UUID)              │
│ user_id                │
│ project_id (nullable)  │
│ title                  │
│ status                 │
│ context (JSON)         │
│ created_at             │
│ updated_at             │
└────────────────────────┘
         │
         │ 1:N
         ▼
chat_messages
┌────────────────────────┐
│ id (UUID)              │
│ session_id             │
│ role (user/assistant)  │
│ content                │
│ metadata (JSON)        │
│ tokens_used            │
│ model_used             │
│ created_at             │
└────────────────────────┘

protocol_drafts
┌────────────────────────┐
│ id (UUID)              │
│ session_id             │
│ project_id (nullable)  │
│ version                │
│ content (JSON)         │
│ status                 │
│ created_at             │
│ updated_at             │
└────────────────────────┘

extracted_protocols
┌────────────────────────┐
│ id (UUID)              │
│ session_id             │
│ source_file_id         │
│ extracted_data (JSON)  │
│ confidence_score       │
│ created_at             │
└────────────────────────┘
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/protocol/sessions` | GET | List user's chat sessions |
| `/protocol/sessions` | POST | Create new chat session |
| `/protocol/sessions/{id}` | GET | Get session details with messages |
| `/protocol/sessions/{id}` | DELETE | Delete a chat session |
| `/protocol/chat` | POST | Send message and get response |
| `/protocol/upload` | POST | Upload document for analysis |
| `/protocol/extract/{file_id}` | POST | Extract protocol from document |
| `/protocol/generate/{session_id}` | POST | Generate protocol draft |
| `/protocol/drafts/{session_id}` | GET | Get protocol drafts for session |

---

## Scalability Considerations

### Horizontal Scaling

1. **Frontend**: Stateless, scales infinitely behind CDN
2. **Gateway**: Stateless (JWT), scales behind load balancer
3. **Forms Service**: Stateless, scales behind load balancer
4. **Protocol Assistant**: Stateless, scales behind load balancer (LLM calls are external)
5. **Database**: Primary/replica setup, read replicas for queries

### Vertical Scaling

1. **Forms Service**: PDF generation is CPU-intensive
   - Consider dedicated worker processes
   - Queue-based document generation

2. **Protocol Assistant**: LLM calls are I/O bound
   - Async processing with AsyncPG
   - Connection pooling for database
   - Rate limiting for LLM API calls

### Caching Strategy (Future)

1. **Redis** for:
   - Session data
   - Rate limiting counters
   - Template schema caching
   - User permissions caching
   - LLM response caching (for repeated queries)

---

## Failure Modes and Recovery

### Database Failure
- Gateway returns 503 Service Unavailable
- Forms Service returns 503 Service Unavailable
- Protocol Assistant returns 503 Service Unavailable
- Frontend shows error state
- **Recovery**: Automatic reconnection with exponential backoff

### Forms Service Failure
- Gateway returns 502 Bad Gateway for form operations
- Other operations (auth, projects) continue to work
- **Recovery**: Docker auto-restart, health checks

### Protocol Assistant Failure
- Gateway returns 502 Bad Gateway for protocol operations
- Form operations and other services continue to work
- **Recovery**: Docker auto-restart, health checks

### Gateway Failure
- Frontend cannot make API calls
- Direct Forms Service access blocked (no auth)
- Direct Protocol Assistant access blocked (no auth)
- **Recovery**: Docker auto-restart, health checks

### LLM API Failure
- Protocol Assistant returns degraded service response
- Chat functionality temporarily unavailable
- **Recovery**: Retry with exponential backoff, fallback to alternative provider

### File Storage Failure
- Document generation fails
- Protocol document uploads fail
- Existing documents inaccessible
- **Recovery**: Volume remount, backup restoration

---

## Port Summary

| Service | Container Port | Host Port | Description |
|---------|---------------|-----------|-------------|
| Frontend | 5173 | 5174 | React development server |
| Gateway | 3000 | 3001 | Node.js API gateway |
| Forms Service | 8000 | 8001 | Python FastAPI forms backend |
| Protocol Assistant | 8000 | 8002 | Python FastAPI AI assistant |
| PostgreSQL | 5432 | 5434 | Database server |

---

*Last Updated: January 23, 2026*
