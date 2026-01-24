# Database Schema Documentation

This document provides a comprehensive reference for the PostgreSQL database schema used in the Radiology Research Platform.

---

## Overview

| Category | Tables | Purpose |
|----------|--------|---------|
| Users & Authentication | 3 | User accounts, sessions, and email preferences |
| Projects | 2 | Research project management |
| Templates | 1 | Form template storage |
| Forms | 3 | Form instances and versioning |
| Audit | 2 | Field-level changes and HIPAA-compliant logging |
| Reviews | 3 | Review workflow stages and actions |
| Collaboration | 5 | Comments, mentions, and editing locks |
| Amendments | 2 | Post-approval changes |
| Files | 1 | File attachments |
| Tasks | 3 | Task definitions, mappings, and tasks |
| Notifications | 1 | User notifications |
| Protocol Assistant | 17 | AI-powered protocol review and document generation |

**Total Tables**: 38

**Database Connection**: Port 5434

---

## Entity Relationship Diagram

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────────┐
│     users       │─────────│    sessions     │         │  email_preferences  │
│                 │◄────────│                 │         │                     │
└────────┬────────┘         └─────────────────┘         └─────────────────────┘
         │                                                        ▲
         │                                                        │
         ├────────────────────────────────────────────────────────┘
         │
         │         ┌─────────────────┐         ┌─────────────────────────┐
         ├────────▶│    projects     │◄────────│  project_collaborators  │
         │         └────────┬────────┘         └─────────────────────────┘
         │                  │
         │                  │
         │         ┌────────▼────────┐         ┌─────────────────┐
         │         │  form_instances │◄────────│    templates    │
         │         └────────┬────────┘         └─────────────────┘
         │                  │
         │    ┌─────────────┼─────────────┬─────────────────────────────┐
         │    │             │             │                             │
         │    ▼             ▼             ▼                             ▼
         │ ┌──────────┐ ┌──────────────┐ ┌──────────────┐    ┌──────────────────┐
         │ │form_data │ │form_versions │ │field_changes │    │form_collaborators│
         │ └──────────┘ └──────────────┘ └──────────────┘    └──────────────────┘
         │                  │
         │                  │             ┌─────────────────┐
         │                  ├────────────▶│  review_actions │
         │                  │             └─────────────────┘
         │                  │
         │    ┌─────────────┼─────────────────────────────────────┐
         │    │             │                                     │
         │    ▼             │                                     ▼
         │ ┌──────────────┐ │ ┌─────────────────┐    ┌────────────────────┐
         │ │ form_reviews │ │ │  review_stages  │    │  comment_threads   │
         │ └──────────────┘ │ └─────────────────┘    └─────────┬──────────┘
         │                  │                                   │
         │                  │                                   ▼
         │                  │                        ┌─────────────────────┐
         │                  │                        │      comments       │
         │                  │                        └─────────┬───────────┘
         │                  │                                   │
         │                  │                                   ▼
         │                  │                        ┌─────────────────────┐
         │                  │                        │  comment_mentions   │
         │                  │                        └─────────────────────┘
         │                  │
         │    ┌─────────────┼─────────────────────────────────────┐
         │    │             │                                     │
         │    ▼             ▼                                     ▼
         │ ┌──────────┐ ┌──────────────┐              ┌──────────────────┐
         │ │amendments│ │editing_locks │              │      files       │
         │ └────┬─────┘ └──────────────┘              └──────────────────┘
         │      │
         │      ▼
         │ ┌────────────────────────┐
         │ │amendment_field_changes │
         │ └────────────────────────┘
         │
         │         ┌─────────────────────┐      ┌──────────────────────────────┐
         ├────────▶│  task_definitions   │◄─────│ project_type_task_mappings   │
         │         └──────────┬──────────┘      └──────────────────────────────┘
         │                    │
         │                    ▼
         │         ┌─────────────────────┐
         ├────────▶│       tasks         │
         │         └─────────────────────┘
         │
         │         ┌─────────────────────┐      ┌──────────────────┐
         └────────▶│   notifications     │      │   audit_logs     │
                   └─────────────────────┘      └──────────────────┘
```

---

## Table Definitions

### Users & Authentication

#### users

Primary user account table for all platform users.

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'reviewer', 'researcher')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    sso_provider VARCHAR(50),
    sso_id VARCHAR(255),
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique identifier |
| email | VARCHAR(255) | UNIQUE, NOT NULL | - | User email address |
| password_hash | VARCHAR(255) | NOT NULL | - | bcrypt hashed password |
| full_name | VARCHAR(255) | NOT NULL | - | User display name |
| role | VARCHAR(50) | NOT NULL, CHECK | - | User role: admin, reviewer, researcher |
| is_active | BOOLEAN | - | true | Account active status |
| email_verified | BOOLEAN | - | false | Email verification status |
| sso_provider | VARCHAR(50) | - | NULL | SSO provider name (future) |
| sso_id | VARCHAR(255) | - | NULL | SSO user identifier (future) |
| failed_login_attempts | INTEGER | - | 0 | Failed login counter for lockout |
| locked_until | TIMESTAMP WITH TIME ZONE | - | NULL | Account lockout expiry time |
| password_reset_token | VARCHAR(255) | - | NULL | Password reset token |
| password_reset_expires | TIMESTAMP WITH TIME ZONE | - | NULL | Reset token expiry |
| last_login_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last successful login timestamp |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Record creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Indexes:**
- `idx_users_email` - Email lookups for authentication
- `idx_users_role` - Role-based filtering
- `idx_users_is_active` - Active user filtering

---

#### sessions

Active user sessions for JWT token management and session tracking.

```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique session identifier |
| user_id | UUID | NOT NULL, FK | - | Reference to users table |
| session_token | VARCHAR(255) | UNIQUE, NOT NULL | - | JWT session token |
| refresh_token | VARCHAR(255) | UNIQUE, NOT NULL | - | JWT refresh token |
| ip_address | INET | - | NULL | Client IP address |
| user_agent | TEXT | - | NULL | Client user agent string |
| expires_at | TIMESTAMP WITH TIME ZONE | NOT NULL | - | Session expiration time |
| is_revoked | BOOLEAN | - | false | Manual revocation flag |
| last_activity_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last activity timestamp |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Session creation timestamp |

**Foreign Keys:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**Indexes:**
- `idx_sessions_user_id` - User session lookups
- `idx_sessions_session_token` - Token validation
- `idx_sessions_refresh_token` - Refresh token validation
- `idx_sessions_expires_at` - Expired session cleanup

---

#### email_preferences

User email notification preferences.

```sql
CREATE TABLE email_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    approval_requests BOOLEAN DEFAULT true,
    status_changes BOOLEAN DEFAULT true,
    comments BOOLEAN DEFAULT true,
    reminders BOOLEAN DEFAULT true,
    task_assignments BOOLEAN DEFAULT true,
    weekly_digest BOOLEAN DEFAULT false,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique identifier |
| user_id | UUID | UNIQUE, NOT NULL, FK | - | Reference to users table |
| approval_requests | BOOLEAN | - | true | Receive approval request emails |
| status_changes | BOOLEAN | - | true | Receive status change emails |
| comments | BOOLEAN | - | true | Receive comment notification emails |
| reminders | BOOLEAN | - | true | Receive reminder emails |
| task_assignments | BOOLEAN | - | true | Receive task assignment emails |
| weekly_digest | BOOLEAN | - | false | Receive weekly digest emails |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Foreign Keys:**
- `user_id` -> `users(id)` ON DELETE CASCADE

---

### Projects

#### projects

Research project management table.

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    project_type VARCHAR(100),
    department VARCHAR(255),
    principal_investigator_id UUID NOT NULL REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'pending_approval', 'approved', 'rejected', 'completed', 'archived')),
    start_date DATE,
    end_date DATE,
    is_public BOOLEAN DEFAULT false,
    submitted_for_approval_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by_id UUID REFERENCES users(id),
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejected_by_id UUID REFERENCES users(id),
    rejection_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_projects_pi ON projects(principal_investigator_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique project identifier |
| title | VARCHAR(500) | NOT NULL | - | Project title |
| description | TEXT | - | NULL | Project description |
| project_type | VARCHAR(100) | - | NULL | Type: retrospective, prospective, clinical_trial, etc. |
| department | VARCHAR(255) | - | NULL | Department name |
| principal_investigator_id | UUID | NOT NULL, FK | - | PI user reference |
| status | VARCHAR(50) | CHECK | 'draft' | Project status (see constraint) |
| start_date | DATE | - | NULL | Planned start date |
| end_date | DATE | - | NULL | Planned end date |
| is_public | BOOLEAN | - | false | Public visibility flag |
| submitted_for_approval_at | TIMESTAMP WITH TIME ZONE | - | NULL | Approval submission timestamp |
| approved_at | TIMESTAMP WITH TIME ZONE | - | NULL | Approval timestamp |
| approved_by_id | UUID | FK | NULL | Approver user reference |
| rejected_at | TIMESTAMP WITH TIME ZONE | - | NULL | Rejection timestamp |
| rejected_by_id | UUID | FK | NULL | Rejector user reference |
| rejection_notes | TEXT | - | NULL | Rejection reason notes |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Status Values:** `draft`, `active`, `pending_approval`, `approved`, `rejected`, `completed`, `archived`

**Foreign Keys:**
- `principal_investigator_id` -> `users(id)`
- `approved_by_id` -> `users(id)`
- `rejected_by_id` -> `users(id)`

**Indexes:**
- `idx_projects_pi` - PI-based lookups
- `idx_projects_status` - Status filtering
- `idx_projects_created_at` - Chronological sorting (descending)

---

#### project_collaborators

Project team member assignments and roles.

```sql
CREATE TABLE project_collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('co_investigator', 'research_assistant', 'coordinator')),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE INDEX idx_project_collaborators_project ON project_collaborators(project_id);
CREATE INDEX idx_project_collaborators_user ON project_collaborators(user_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique identifier |
| project_id | UUID | NOT NULL, FK | - | Reference to projects table |
| user_id | UUID | NOT NULL, FK | - | Reference to users table |
| role | VARCHAR(50) | NOT NULL, CHECK | - | Collaborator role |
| added_at | TIMESTAMP WITH TIME ZONE | - | NOW() | When collaborator was added |

**Role Values:** `co_investigator`, `research_assistant`, `coordinator`

**Foreign Keys:**
- `project_id` -> `projects(id)` ON DELETE CASCADE
- `user_id` -> `users(id)` ON DELETE CASCADE

**Unique Constraint:** `(project_id, user_id)` - Prevents duplicate collaborator entries

**Indexes:**
- `idx_project_collaborators_project` - Project team lookups
- `idx_project_collaborators_user` - User project memberships

---

### Templates

#### templates

Form template definitions with JSON schemas for dynamic form rendering.

```sql
CREATE TABLE templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    original_file_path VARCHAR(500),
    original_file_name VARCHAR(255),
    schema JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_templates_is_active ON templates(is_active);
CREATE INDEX idx_templates_is_published ON templates(is_published);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique template identifier |
| name | VARCHAR(255) | NOT NULL | - | Template name |
| description | TEXT | - | NULL | Template description |
| version | VARCHAR(50) | NOT NULL | '1.0' | Template version string |
| original_file_path | VARCHAR(500) | - | NULL | Path to original uploaded file |
| original_file_name | VARCHAR(255) | - | NULL | Original uploaded filename |
| schema | JSONB | NOT NULL | '{}' | Form schema definition |
| is_active | BOOLEAN | - | true | Template availability flag |
| is_published | BOOLEAN | - | false | Publication status |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Schema JSONB Structure:**
```json
{
  "sections": [
    {
      "id": "section_id",
      "title": "Section Title",
      "description": "Section description",
      "fields": ["field_id_1", "field_id_2"]
    }
  ],
  "fields": [
    {
      "id": "field_id",
      "type": "text|textarea|checkbox|radio|select|date|file",
      "label": "Field Label",
      "required": true,
      "validation": {},
      "condition": {
        "field": "other_field_id",
        "operator": "equals",
        "value": "some_value"
      }
    }
  ],
  "rules": []
}
```

**Indexes:**
- `idx_templates_is_active` - Active template filtering
- `idx_templates_is_published` - Published template filtering

---

### Forms

#### form_instances

Active form instances created from templates.

```sql
CREATE TABLE form_instances (
    id SERIAL PRIMARY KEY,
    template_id INTEGER NOT NULL REFERENCES templates(id),
    project_id UUID REFERENCES projects(id),
    owner_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'needs_changes', 'approved', 'rejected', 'locked')),
    current_version_number INTEGER DEFAULT 1,
    completion_percentage INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    submitted_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_form_instances_template ON form_instances(template_id);
CREATE INDEX idx_form_instances_project ON form_instances(project_id);
CREATE INDEX idx_form_instances_owner ON form_instances(owner_id);
CREATE INDEX idx_form_instances_status ON form_instances(status);
CREATE INDEX idx_form_instances_created_at ON form_instances(created_at DESC);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique form instance identifier |
| template_id | INTEGER | NOT NULL, FK | - | Reference to templates table |
| project_id | UUID | FK | NULL | Reference to projects table (optional) |
| owner_id | UUID | NOT NULL, FK | - | Form owner user reference |
| title | VARCHAR(500) | NOT NULL | - | Form instance title |
| status | VARCHAR(50) | CHECK | 'draft' | Form status (see constraint) |
| current_version_number | INTEGER | - | 1 | Current version number |
| completion_percentage | INTEGER | - | 0 | Form completion percentage (0-100) |
| version | INTEGER | - | 1 | Optimistic locking version (incremented on each save) |
| submitted_at | TIMESTAMP WITH TIME ZONE | - | NULL | Submission timestamp |
| approved_at | TIMESTAMP WITH TIME ZONE | - | NULL | Approval timestamp |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Status Values:** `draft`, `in_review`, `needs_changes`, `approved`, `rejected`, `locked`

**Optimistic Locking:** The `version` column is used to prevent concurrent edit conflicts. When saving form data, the client must provide the expected version number. If the server's version differs (indicating another save occurred), the save is rejected with a conflict error, prompting the user to refresh and re-apply their changes.

**Foreign Keys:**
- `template_id` -> `templates(id)`
- `project_id` -> `projects(id)`
- `owner_id` -> `users(id)`

**Indexes:**
- `idx_form_instances_template` - Template-based lookups
- `idx_form_instances_project` - Project form lookups
- `idx_form_instances_owner` - Owner form lookups
- `idx_form_instances_status` - Status filtering
- `idx_form_instances_created_at` - Chronological sorting (descending)

---

#### form_data

Current working data for form instances (editable state).

```sql
CREATE TABLE form_data (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER UNIQUE NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}'::jsonb,
    conditional_state JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_form_data_form_instance ON form_data(form_instance_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique identifier |
| form_instance_id | INTEGER | UNIQUE, NOT NULL, FK | - | Reference to form_instances (1:1) |
| data | JSONB | - | '{}' | Form field values |
| conditional_state | JSONB | - | '{}' | Conditional field visibility state |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Data JSONB Structure:**
```json
{
  "field_id_1": "text value",
  "field_id_2": true,
  "field_id_3": ["option1", "option2"],
  "repeatable_field": [
    {"sub_field_1": "value1"},
    {"sub_field_1": "value2"}
  ]
}
```

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE

**Indexes:**
- `idx_form_data_form_instance` - Form data lookups

---

#### form_versions

Immutable version snapshots for form instances.

```sql
CREATE TABLE form_versions (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_label VARCHAR(100),
    data_snapshot JSONB NOT NULL,
    conditional_state_snapshot JSONB,
    status_at_creation VARCHAR(50),
    change_summary TEXT,
    generated_docx_path VARCHAR(500),
    generated_pdf_path VARCHAR(500),
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(form_instance_id, version_number)
);

CREATE INDEX idx_form_versions_form_instance ON form_versions(form_instance_id);
CREATE INDEX idx_form_versions_created_at ON form_versions(created_at DESC);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique version identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| version_number | INTEGER | NOT NULL | - | Sequential version number |
| version_label | VARCHAR(100) | - | NULL | Human-readable version label |
| data_snapshot | JSONB | NOT NULL | - | Immutable snapshot of form data |
| conditional_state_snapshot | JSONB | - | NULL | Snapshot of conditional state |
| status_at_creation | VARCHAR(50) | - | NULL | Form status when version created |
| change_summary | TEXT | - | NULL | Description of changes |
| generated_docx_path | VARCHAR(500) | - | NULL | Path to generated DOCX file |
| generated_pdf_path | VARCHAR(500) | - | NULL | Path to generated PDF file |
| created_by_id | UUID | FK | NULL | User who created this version |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Version creation timestamp |

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `created_by_id` -> `users(id)`

**Unique Constraint:** `(form_instance_id, version_number)` - Ensures unique version numbers per form

**Indexes:**
- `idx_form_versions_form_instance` - Form version lookups
- `idx_form_versions_created_at` - Chronological sorting (descending)

---

### Audit

#### field_changes

Field-level change audit trail for form edits.

```sql
CREATE TABLE field_changes (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    version_id INTEGER REFERENCES form_versions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    field_id VARCHAR(255) NOT NULL,
    field_label VARCHAR(500),
    old_value JSONB,
    new_value JSONB,
    action_type VARCHAR(50) DEFAULT 'update',
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_field_changes_form_instance ON field_changes(form_instance_id);
CREATE INDEX idx_field_changes_user ON field_changes(user_id);
CREATE INDEX idx_field_changes_field_id ON field_changes(field_id);
CREATE INDEX idx_field_changes_created_at ON field_changes(created_at DESC);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique change identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| version_id | INTEGER | FK | NULL | Reference to form_versions (if versioned) |
| user_id | UUID | NOT NULL, FK | - | User who made the change |
| field_id | VARCHAR(255) | NOT NULL | - | Field identifier |
| field_label | VARCHAR(500) | - | NULL | Human-readable field label |
| old_value | JSONB | - | NULL | Previous field value |
| new_value | JSONB | - | NULL | New field value |
| action_type | VARCHAR(50) | - | 'update' | Type of change action |
| session_id | VARCHAR(255) | - | NULL | Session identifier for grouping |
| ip_address | INET | - | NULL | Client IP address |
| user_agent | TEXT | - | NULL | Client user agent |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Change timestamp |

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `version_id` -> `form_versions(id)`
- `user_id` -> `users(id)`

**Indexes:**
- `idx_field_changes_form_instance` - Form change history
- `idx_field_changes_user` - User change history
- `idx_field_changes_field_id` - Field-specific change history
- `idx_field_changes_created_at` - Chronological sorting (descending)

---

#### audit_logs

HIPAA-compliant audit trail (append-only).

```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL CHECK (action IN ('login', 'logout', 'login_failed', 'create', 'read', 'update', 'delete', 'download', 'upload', 'approve', 'reject', 'submit', 'export', 'password_change', 'password_reset')),
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    session_id VARCHAR(255),
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Prevent updates and deletes (append-only)
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_session ON audit_logs(session_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique log entry identifier |
| user_id | UUID | FK | NULL | User who performed action (NULL for anonymous) |
| action | VARCHAR(100) | NOT NULL, CHECK | - | Action type (see constraint) |
| resource_type | VARCHAR(100) | NOT NULL | - | Type of resource affected |
| resource_id | VARCHAR(255) | - | NULL | Identifier of affected resource |
| ip_address | INET | - | NULL | Client IP address |
| user_agent | TEXT | - | NULL | Client user agent |
| details | JSONB | - | NULL | Additional action details |
| session_id | VARCHAR(255) | - | NULL | Session identifier |
| success | BOOLEAN | - | true | Whether action succeeded |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Action timestamp |

**Action Values:** `login`, `logout`, `login_failed`, `create`, `read`, `update`, `delete`, `download`, `upload`, `approve`, `reject`, `submit`, `export`, `password_change`, `password_reset`

**Foreign Keys:**
- `user_id` -> `users(id)`

**Rules (Append-Only Enforcement):**
- `audit_logs_no_update` - Prevents UPDATE operations
- `audit_logs_no_delete` - Prevents DELETE operations

**Indexes:**
- `idx_audit_logs_user` - User activity lookups
- `idx_audit_logs_action` - Action type filtering
- `idx_audit_logs_resource` - Resource-specific audit trail
- `idx_audit_logs_created_at` - Chronological sorting (descending)
- `idx_audit_logs_session` - Session activity grouping

---

### Reviews

#### review_stages

Configurable review workflow stages.

```sql
CREATE TABLE review_stages (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sequence_order INTEGER NOT NULL,
    default_deadline_days INTEGER DEFAULT 7,
    requires_all_previous BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique stage identifier |
| code | VARCHAR(50) | UNIQUE, NOT NULL | - | Unique stage code |
| name | VARCHAR(255) | NOT NULL | - | Stage display name |
| description | TEXT | - | NULL | Stage description |
| sequence_order | INTEGER | NOT NULL | - | Stage order in workflow |
| default_deadline_days | INTEGER | - | 7 | Default deadline in days |
| requires_all_previous | BOOLEAN | - | true | Must complete previous stages |
| is_active | BOOLEAN | - | true | Stage availability flag |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |

**Default Stages (Seeded Data):**

| Code | Name | Order | Deadline Days |
|------|------|-------|---------------|
| initial_review | Initial Review | 1 | 7 |
| department_review | Department Review | 2 | 5 |
| irb_review | IRB Board Review | 3 | 14 |

---

#### form_reviews

Review assignments and status tracking.

```sql
CREATE TABLE form_reviews (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    review_stage_id INTEGER REFERENCES review_stages(id),
    reviewer_id UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'approved', 'rejected', 'revision_required')),
    deadline DATE,
    overall_comments TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_form_reviews_form_instance ON form_reviews(form_instance_id);
CREATE INDEX idx_form_reviews_reviewer ON form_reviews(reviewer_id);
CREATE INDEX idx_form_reviews_status ON form_reviews(status);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique review identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| review_stage_id | INTEGER | FK | NULL | Reference to review_stages |
| reviewer_id | UUID | FK | NULL | Assigned reviewer |
| status | VARCHAR(50) | CHECK | 'pending' | Review status (see constraint) |
| deadline | DATE | - | NULL | Review deadline |
| overall_comments | TEXT | - | NULL | Reviewer overall comments |
| started_at | TIMESTAMP WITH TIME ZONE | - | NULL | When review was started |
| completed_at | TIMESTAMP WITH TIME ZONE | - | NULL | When review was completed |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |

**Status Values:** `pending`, `assigned`, `in_progress`, `approved`, `rejected`, `revision_required`

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `review_stage_id` -> `review_stages(id)`
- `reviewer_id` -> `users(id)`

**Indexes:**
- `idx_form_reviews_form_instance` - Form review lookups
- `idx_form_reviews_reviewer` - Reviewer workload
- `idx_form_reviews_status` - Status filtering

---

#### review_actions

Review action history and audit trail.

```sql
CREATE TABLE review_actions (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    version_id INTEGER REFERENCES form_versions(id),
    performed_by_id UUID NOT NULL REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('submit_for_review', 'request_changes', 'approve', 'reject', 'return_to_draft')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_review_actions_form_instance ON review_actions(form_instance_id);
CREATE INDEX idx_review_actions_performed_by ON review_actions(performed_by_id);
CREATE INDEX idx_review_actions_created_at ON review_actions(created_at DESC);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique action identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| version_id | INTEGER | FK | NULL | Reference to form_versions |
| performed_by_id | UUID | NOT NULL, FK | - | User who performed action |
| action_type | VARCHAR(50) | NOT NULL, CHECK | - | Type of review action |
| notes | TEXT | - | NULL | Action notes/comments |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Action timestamp |

**Action Types:** `submit_for_review`, `request_changes`, `approve`, `reject`, `return_to_draft`

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `version_id` -> `form_versions(id)`
- `performed_by_id` -> `users(id)`

**Indexes:**
- `idx_review_actions_form_instance` - Form action history
- `idx_review_actions_performed_by` - User action history
- `idx_review_actions_created_at` - Chronological sorting (descending)

---

### Collaboration

#### form_collaborators

Form-level access permissions and role assignments.

```sql
CREATE TABLE form_collaborators (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('editor', 'viewer', 'commenter')),
    section_assignments JSONB,
    added_by_id UUID REFERENCES users(id),
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(form_instance_id, user_id)
);

CREATE INDEX idx_form_collaborators_form ON form_collaborators(form_instance_id);
CREATE INDEX idx_form_collaborators_user ON form_collaborators(user_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| user_id | UUID | NOT NULL, FK | - | Reference to users |
| role | VARCHAR(50) | NOT NULL, CHECK | - | Collaborator role |
| section_assignments | JSONB | - | NULL | Specific section assignments |
| added_by_id | UUID | FK | NULL | User who added collaborator |
| added_at | TIMESTAMP WITH TIME ZONE | - | NOW() | When collaborator was added |

**Role Values:** `editor`, `viewer`, `commenter`

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `user_id` -> `users(id)` ON DELETE CASCADE
- `added_by_id` -> `users(id)`

**Unique Constraint:** `(form_instance_id, user_id)` - Prevents duplicate collaborators

**Indexes:**
- `idx_form_collaborators_form` - Form collaborator lookups
- `idx_form_collaborators_user` - User collaboration lookups

---

#### comment_threads

Discussion threads on forms, optionally anchored to fields or sections.

```sql
CREATE TABLE comment_threads (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    field_id VARCHAR(255),
    section_id VARCHAR(255),
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comment_threads_form ON comment_threads(form_instance_id);
CREATE INDEX idx_comment_threads_field ON comment_threads(field_id);
CREATE INDEX idx_comment_threads_is_resolved ON comment_threads(is_resolved);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique thread identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| field_id | VARCHAR(255) | - | NULL | Anchored field identifier |
| section_id | VARCHAR(255) | - | NULL | Anchored section identifier |
| is_resolved | BOOLEAN | - | false | Thread resolution status |
| resolved_at | TIMESTAMP WITH TIME ZONE | - | NULL | Resolution timestamp |
| resolved_by_id | UUID | FK | NULL | User who resolved thread |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Thread creation timestamp |

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `resolved_by_id` -> `users(id)`

**Indexes:**
- `idx_comment_threads_form` - Form thread lookups
- `idx_comment_threads_field` - Field-specific threads
- `idx_comment_threads_is_resolved` - Resolution status filtering

---

#### comments

Individual comments within threads.

```sql
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    thread_id INTEGER NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
    parent_comment_id INTEGER REFERENCES comments(id),
    author_id UUID NOT NULL REFERENCES users(id),
    content TEXT NOT NULL,
    is_edited BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comments_thread ON comments(thread_id);
CREATE INDEX idx_comments_author ON comments(author_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique comment identifier |
| thread_id | INTEGER | NOT NULL, FK | - | Reference to comment_threads |
| parent_comment_id | INTEGER | FK | NULL | Reference to parent comment (replies) |
| author_id | UUID | NOT NULL, FK | - | Comment author |
| content | TEXT | NOT NULL | - | Comment content |
| is_edited | BOOLEAN | - | false | Edit status flag |
| is_deleted | BOOLEAN | - | false | Soft delete flag |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Foreign Keys:**
- `thread_id` -> `comment_threads(id)` ON DELETE CASCADE
- `parent_comment_id` -> `comments(id)` (self-referential for replies)
- `author_id` -> `users(id)`

**Indexes:**
- `idx_comments_thread` - Thread comment lookups
- `idx_comments_author` - User comment lookups

---

#### comment_mentions

@mentions in comments for notifications.

```sql
CREATE TABLE comment_mentions (
    id SERIAL PRIMARY KEY,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_comment_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX idx_comment_mentions_user ON comment_mentions(mentioned_user_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique mention identifier |
| comment_id | INTEGER | NOT NULL, FK | - | Reference to comments |
| mentioned_user_id | UUID | NOT NULL, FK | - | Mentioned user |
| notified | BOOLEAN | - | false | Notification sent status |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Mention creation timestamp |

**Foreign Keys:**
- `comment_id` -> `comments(id)` ON DELETE CASCADE
- `mentioned_user_id` -> `users(id)` ON DELETE CASCADE

**Indexes:**
- `idx_comment_mentions_comment` - Comment mention lookups
- `idx_comment_mentions_user` - User mention lookups

---

#### editing_locks

Concurrent edit prevention with expiring locks.

```sql
CREATE TABLE editing_locks (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    section_id VARCHAR(255),
    locked_by_id UUID NOT NULL REFERENCES users(id),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_editing_locks_form ON editing_locks(form_instance_id);
CREATE INDEX idx_editing_locks_expires ON editing_locks(expires_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique lock identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| section_id | VARCHAR(255) | - | NULL | Locked section (NULL for whole form) |
| locked_by_id | UUID | NOT NULL, FK | - | User holding the lock |
| expires_at | TIMESTAMP WITH TIME ZONE | NOT NULL | - | Lock expiration time |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Lock creation timestamp |

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `locked_by_id` -> `users(id)`

**Indexes:**
- `idx_editing_locks_form` - Form lock lookups
- `idx_editing_locks_expires` - Expired lock cleanup

---

### Amendments

#### amendments

Post-approval change requests for locked forms.

```sql
CREATE TABLE amendments (
    id SERIAL PRIMARY KEY,
    form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
    amendment_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    description TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE,
    submitted_by_id UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_amendments_form ON amendments(form_instance_id);
CREATE INDEX idx_amendments_status ON amendments(status);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique amendment identifier |
| form_instance_id | INTEGER | NOT NULL, FK | - | Reference to form_instances |
| amendment_type | VARCHAR(100) | NOT NULL | - | Type of amendment |
| status | VARCHAR(50) | CHECK | 'draft' | Amendment status |
| description | TEXT | - | NULL | Amendment description |
| submitted_at | TIMESTAMP WITH TIME ZONE | - | NULL | Submission timestamp |
| submitted_by_id | UUID | FK | NULL | User who submitted |
| reviewed_at | TIMESTAMP WITH TIME ZONE | - | NULL | Review timestamp |
| reviewed_by_id | UUID | FK | NULL | User who reviewed |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |

**Status Values:** `draft`, `submitted`, `approved`, `rejected`

**Foreign Keys:**
- `form_instance_id` -> `form_instances(id)` ON DELETE CASCADE
- `submitted_by_id` -> `users(id)`
- `reviewed_by_id` -> `users(id)`

**Indexes:**
- `idx_amendments_form` - Form amendment lookups
- `idx_amendments_status` - Status filtering

---

#### amendment_field_changes

Field-level changes within an amendment.

```sql
CREATE TABLE amendment_field_changes (
    id SERIAL PRIMARY KEY,
    amendment_id INTEGER NOT NULL REFERENCES amendments(id) ON DELETE CASCADE,
    field_id VARCHAR(255) NOT NULL,
    old_value JSONB,
    new_value JSONB,
    justification TEXT
);

CREATE INDEX idx_amendment_changes_amendment ON amendment_field_changes(amendment_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique change identifier |
| amendment_id | INTEGER | NOT NULL, FK | - | Reference to amendments |
| field_id | VARCHAR(255) | NOT NULL | - | Changed field identifier |
| old_value | JSONB | - | NULL | Previous field value |
| new_value | JSONB | - | NULL | New field value |
| justification | TEXT | - | NULL | Justification for change |

**Foreign Keys:**
- `amendment_id` -> `amendments(id)` ON DELETE CASCADE

**Indexes:**
- `idx_amendment_changes_amendment` - Amendment change lookups

---

### Files

#### files

File attachments for projects and forms.

```sql
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES projects(id),
    form_instance_id INTEGER REFERENCES form_instances(id),
    uploaded_by_id UUID NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    original_file_name VARCHAR(255) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    category VARCHAR(100) CHECK (category IN ('proposal', 'abstract', 'protocol', 'consent_form', 'citi_certificate', 'funding', 'data_management', 'irb_document', 'data', 'result', 'template', 'generated', 'other')),
    storage_path VARCHAR(500) NOT NULL,
    checksum VARCHAR(64),
    is_encrypted BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_form ON files(form_instance_id);
CREATE INDEX idx_files_uploaded_by ON files(uploaded_by_id);
CREATE INDEX idx_files_category ON files(category);
CREATE INDEX idx_files_is_deleted ON files(is_deleted);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique file identifier |
| project_id | UUID | FK | NULL | Reference to projects (optional) |
| form_instance_id | INTEGER | FK | NULL | Reference to form_instances (optional) |
| uploaded_by_id | UUID | NOT NULL, FK | - | User who uploaded file |
| file_name | VARCHAR(255) | NOT NULL | - | Stored file name (sanitized) |
| original_file_name | VARCHAR(255) | NOT NULL | - | Original uploaded file name |
| file_size | BIGINT | - | NULL | File size in bytes |
| mime_type | VARCHAR(100) | - | NULL | MIME content type |
| category | VARCHAR(100) | CHECK | NULL | File category (see constraint) |
| storage_path | VARCHAR(500) | NOT NULL | - | Server storage path |
| checksum | VARCHAR(64) | - | NULL | SHA-256 checksum |
| is_encrypted | BOOLEAN | - | false | Encryption status |
| is_deleted | BOOLEAN | - | false | Soft delete flag |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Upload timestamp |

**Category Values:** `proposal`, `abstract`, `protocol`, `consent_form`, `citi_certificate`, `funding`, `data_management`, `irb_document`, `data`, `result`, `template`, `generated`, `other`

**Foreign Keys:**
- `project_id` -> `projects(id)`
- `form_instance_id` -> `form_instances(id)`
- `uploaded_by_id` -> `users(id)`

**Indexes:**
- `idx_files_project` - Project file lookups
- `idx_files_form` - Form file lookups
- `idx_files_uploaded_by` - User upload lookups
- `idx_files_category` - Category filtering
- `idx_files_is_deleted` - Active file filtering

---

### Tasks

#### task_definitions

Task definition templates for configurable project workflows.

```sql
CREATE TABLE task_definitions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    task_type VARCHAR(50) NOT NULL CHECK (task_type IN ('document_upload', 'form_completion', 'approval_required')),
    template_id INTEGER REFERENCES templates(id),
    file_category VARCHAR(50),
    auto_submit BOOLEAN DEFAULT false,
    default_required BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_task_definitions_active ON task_definitions(is_active);
CREATE INDEX idx_task_definitions_type ON task_definitions(task_type);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique definition identifier |
| name | VARCHAR(100) | UNIQUE, NOT NULL | - | Task definition name |
| description | TEXT | - | NULL | Task description |
| task_type | VARCHAR(50) | NOT NULL, CHECK | - | Task type category |
| template_id | INTEGER | FK | NULL | Associated template (for form_completion) |
| file_category | VARCHAR(50) | - | NULL | Expected file category (for document_upload) |
| auto_submit | BOOLEAN | - | false | Auto-submit when completed |
| default_required | BOOLEAN | - | true | Required by default |
| display_order | INTEGER | - | 0 | UI display order |
| is_active | BOOLEAN | - | true | Definition availability |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Task Type Values:** `document_upload`, `form_completion`, `approval_required`

**Foreign Keys:**
- `template_id` -> `templates(id)`

**Indexes:**
- `idx_task_definitions_active` - Active definition filtering
- `idx_task_definitions_type` - Type-based filtering

---

#### project_type_task_mappings

Maps task definitions to project types for workflow configuration.

```sql
CREATE TABLE project_type_task_mappings (
    id SERIAL PRIMARY KEY,
    project_type VARCHAR(100) NOT NULL,
    task_definition_id INTEGER NOT NULL REFERENCES task_definitions(id) ON DELETE CASCADE,
    is_required BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(project_type, task_definition_id)
);

CREATE INDEX idx_project_type_mappings_type ON project_type_task_mappings(project_type);
CREATE INDEX idx_project_type_mappings_definition ON project_type_task_mappings(task_definition_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique mapping identifier |
| project_type | VARCHAR(100) | NOT NULL | - | Project type identifier |
| task_definition_id | INTEGER | NOT NULL, FK | - | Reference to task_definitions |
| is_required | BOOLEAN | - | true | Whether task is required for type |
| display_order | INTEGER | - | 0 | UI display order |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |

**Foreign Keys:**
- `task_definition_id` -> `task_definitions(id)` ON DELETE CASCADE

**Unique Constraint:** `(project_type, task_definition_id)` - Prevents duplicate mappings

**Indexes:**
- `idx_project_type_mappings_type` - Project type lookups
- `idx_project_type_mappings_definition` - Definition usage lookups

---

#### tasks

Task instances with workflow tracking and review support.

```sql
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    project_id UUID REFERENCES projects(id),
    form_instance_id INTEGER REFERENCES form_instances(id),
    task_definition_id INTEGER REFERENCES task_definitions(id),
    assigned_to_id UUID REFERENCES users(id),
    created_by_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    task_type VARCHAR(100) CHECK (task_type IN ('document_upload', 'form_completion', 'approval_required', 'review', 'approval', 'general')),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected', 'revision_required', 'completed', 'blocked', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    due_date DATE,
    completed_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by_id UUID REFERENCES users(id),
    reviewer_comments TEXT,
    revision_count INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_form ON tasks(form_instance_id);
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_definition ON tasks(task_definition_id);
CREATE INDEX idx_tasks_reviewed_by ON tasks(reviewed_by_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique task identifier |
| project_id | UUID | FK | NULL | Reference to projects |
| form_instance_id | INTEGER | FK | NULL | Reference to form_instances |
| task_definition_id | INTEGER | FK | NULL | Reference to task_definitions |
| assigned_to_id | UUID | FK | NULL | Assigned user |
| created_by_id | UUID | NOT NULL, FK | - | User who created task |
| title | VARCHAR(500) | NOT NULL | - | Task title |
| description | TEXT | - | NULL | Task description |
| task_type | VARCHAR(100) | CHECK | NULL | Task type (see constraint) |
| status | VARCHAR(50) | CHECK | 'pending' | Task status (see constraint) |
| priority | VARCHAR(20) | CHECK | 'medium' | Task priority (see constraint) |
| due_date | DATE | - | NULL | Task due date |
| completed_at | TIMESTAMP WITH TIME ZONE | - | NULL | Completion timestamp |
| submitted_at | TIMESTAMP WITH TIME ZONE | - | NULL | Submission timestamp |
| reviewed_at | TIMESTAMP WITH TIME ZONE | - | NULL | Review timestamp |
| reviewed_by_id | UUID | FK | NULL | Reviewer user |
| reviewer_comments | TEXT | - | NULL | Reviewer feedback |
| revision_count | INTEGER | - | 0 | Number of revision cycles |
| is_required | BOOLEAN | - | true | Whether task is required |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp (auto-updated via trigger) |

**Task Type Values:** `document_upload`, `form_completion`, `approval_required`, `review`, `approval`, `general`

**Status Values:** `pending`, `in_progress`, `submitted`, `approved`, `rejected`, `revision_required`, `completed`, `blocked`, `cancelled`

**Priority Values:** `low`, `medium`, `high`, `urgent`

**Task Status Flow:**
```
pending -> in_progress -> submitted -> approved/rejected/revision_required
                                    -> completed (final state)
                                    -> blocked/cancelled (terminal states)
```

**Foreign Keys:**
- `project_id` -> `projects(id)`
- `form_instance_id` -> `form_instances(id)`
- `task_definition_id` -> `task_definitions(id)`
- `assigned_to_id` -> `users(id)`
- `created_by_id` -> `users(id)`
- `reviewed_by_id` -> `users(id)`

**Indexes:**
- `idx_tasks_project` - Project task lookups
- `idx_tasks_form` - Form task lookups
- `idx_tasks_assigned_to` - User assignment lookups
- `idx_tasks_status` - Status filtering
- `idx_tasks_due_date` - Due date filtering/sorting
- `idx_tasks_definition` - Definition-based lookups
- `idx_tasks_reviewed_by` - Reviewer lookups

---

### Notifications

#### notifications

User notifications for platform events.

```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL CHECK (type IN ('approval_request', 'status_change', 'comment', 'reminder', 'mention', 'task_assigned', 'system')),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique notification identifier |
| user_id | UUID | NOT NULL, FK | - | Recipient user |
| type | VARCHAR(100) | NOT NULL, CHECK | - | Notification type (see constraint) |
| title | VARCHAR(255) | NOT NULL | - | Notification title |
| message | TEXT | - | NULL | Notification message body |
| link | VARCHAR(500) | - | NULL | Related resource link |
| is_read | BOOLEAN | - | false | Read status |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |

**Type Values:** `approval_request`, `status_change`, `comment`, `reminder`, `mention`, `task_assigned`, `system`

**Foreign Keys:**
- `user_id` -> `users(id)` ON DELETE CASCADE

**Indexes:**
- `idx_notifications_user` - User notification lookups
- `idx_notifications_is_read` - Unread notification filtering
- `idx_notifications_created_at` - Chronological sorting (descending)

---

## Indexes Summary

| Table | Index Name | Columns | Purpose |
|-------|------------|---------|---------|
| users | idx_users_email | email | Authentication lookups |
| users | idx_users_role | role | Role-based filtering |
| users | idx_users_is_active | is_active | Active user filtering |
| sessions | idx_sessions_user_id | user_id | User session lookups |
| sessions | idx_sessions_session_token | session_token | Token validation |
| sessions | idx_sessions_refresh_token | refresh_token | Refresh token validation |
| sessions | idx_sessions_expires_at | expires_at | Expired session cleanup |
| projects | idx_projects_pi | principal_investigator_id | PI project lookups |
| projects | idx_projects_status | status | Status filtering |
| projects | idx_projects_created_at | created_at DESC | Chronological sorting |
| project_collaborators | idx_project_collaborators_project | project_id | Project team lookups |
| project_collaborators | idx_project_collaborators_user | user_id | User project memberships |
| templates | idx_templates_is_active | is_active | Active template filtering |
| templates | idx_templates_is_published | is_published | Published template filtering |
| form_instances | idx_form_instances_template | template_id | Template-based lookups |
| form_instances | idx_form_instances_project | project_id | Project form lookups |
| form_instances | idx_form_instances_owner | owner_id | Owner form lookups |
| form_instances | idx_form_instances_status | status | Status filtering |
| form_instances | idx_form_instances_created_at | created_at DESC | Chronological sorting |
| form_data | idx_form_data_form_instance | form_instance_id | Form data lookups |
| form_versions | idx_form_versions_form_instance | form_instance_id | Form version lookups |
| form_versions | idx_form_versions_created_at | created_at DESC | Chronological sorting |
| field_changes | idx_field_changes_form_instance | form_instance_id | Form change history |
| field_changes | idx_field_changes_user | user_id | User change history |
| field_changes | idx_field_changes_field_id | field_id | Field-specific changes |
| field_changes | idx_field_changes_created_at | created_at DESC | Chronological sorting |
| review_stages | (none) | - | Small lookup table |
| form_reviews | idx_form_reviews_form_instance | form_instance_id | Form review lookups |
| form_reviews | idx_form_reviews_reviewer | reviewer_id | Reviewer workload |
| form_reviews | idx_form_reviews_status | status | Status filtering |
| review_actions | idx_review_actions_form_instance | form_instance_id | Form action history |
| review_actions | idx_review_actions_performed_by | performed_by_id | User action history |
| review_actions | idx_review_actions_created_at | created_at DESC | Chronological sorting |
| form_collaborators | idx_form_collaborators_form | form_instance_id | Form collaborator lookups |
| form_collaborators | idx_form_collaborators_user | user_id | User collaboration lookups |
| comment_threads | idx_comment_threads_form | form_instance_id | Form thread lookups |
| comment_threads | idx_comment_threads_field | field_id | Field-specific threads |
| comment_threads | idx_comment_threads_is_resolved | is_resolved | Resolution filtering |
| comments | idx_comments_thread | thread_id | Thread comment lookups |
| comments | idx_comments_author | author_id | User comment lookups |
| comment_mentions | idx_comment_mentions_comment | comment_id | Comment mention lookups |
| comment_mentions | idx_comment_mentions_user | mentioned_user_id | User mention lookups |
| editing_locks | idx_editing_locks_form | form_instance_id | Form lock lookups |
| editing_locks | idx_editing_locks_expires | expires_at | Expired lock cleanup |
| amendments | idx_amendments_form | form_instance_id | Form amendment lookups |
| amendments | idx_amendments_status | status | Status filtering |
| amendment_field_changes | idx_amendment_changes_amendment | amendment_id | Amendment change lookups |
| files | idx_files_project | project_id | Project file lookups |
| files | idx_files_form | form_instance_id | Form file lookups |
| files | idx_files_uploaded_by | uploaded_by_id | User upload lookups |
| files | idx_files_category | category | Category filtering |
| files | idx_files_is_deleted | is_deleted | Active file filtering |
| task_definitions | idx_task_definitions_active | is_active | Active definition filtering |
| task_definitions | idx_task_definitions_type | task_type | Type-based filtering |
| project_type_task_mappings | idx_project_type_mappings_type | project_type | Project type lookups |
| project_type_task_mappings | idx_project_type_mappings_definition | task_definition_id | Definition usage lookups |
| tasks | idx_tasks_project | project_id | Project task lookups |
| tasks | idx_tasks_form | form_instance_id | Form task lookups |
| tasks | idx_tasks_assigned_to | assigned_to_id | User assignment lookups |
| tasks | idx_tasks_status | status | Status filtering |
| tasks | idx_tasks_due_date | due_date | Due date filtering |
| tasks | idx_tasks_definition | task_definition_id | Definition-based lookups |
| tasks | idx_tasks_reviewed_by | reviewed_by_id | Reviewer lookups |
| notifications | idx_notifications_user | user_id | User notification lookups |
| notifications | idx_notifications_is_read | is_read | Unread filtering |
| notifications | idx_notifications_created_at | created_at DESC | Chronological sorting |
| audit_logs | idx_audit_logs_user | user_id | User activity lookups |
| audit_logs | idx_audit_logs_action | action | Action type filtering |
| audit_logs | idx_audit_logs_resource | resource_type, resource_id | Resource audit trail |
| audit_logs | idx_audit_logs_created_at | created_at DESC | Chronological sorting |
| audit_logs | idx_audit_logs_session | session_id | Session activity grouping |

---

## Triggers

The following triggers automatically update the `updated_at` column:

| Table | Trigger Name |
|-------|--------------|
| users | update_users_updated_at |
| projects | update_projects_updated_at |
| templates | update_templates_updated_at |
| form_instances | update_form_instances_updated_at |
| form_data | update_form_data_updated_at |
| comments | update_comments_updated_at |
| tasks | update_tasks_updated_at |
| email_preferences | update_email_preferences_updated_at |

All triggers use the shared function `update_updated_at_column()`.

---

## Migration Information

### Schema Version
- **Current Version**: 1.0.0
- **PostgreSQL Compatibility**: 15+
- **UUID Extension Required**: `uuid-ossp`

### Default Seeded Data

**Review Stages:**
```sql
INSERT INTO review_stages (code, name, description, sequence_order, default_deadline_days) VALUES
('initial_review', 'Initial Review', 'Initial review by assigned reviewer', 1, 7),
('department_review', 'Department Review', 'Review by department head', 2, 5),
('irb_review', 'IRB Board Review', 'Final review by IRB board', 3, 14);
```

---

## Maintenance

### Vacuuming
```sql
-- Regular maintenance
VACUUM ANALYZE;

-- Full vacuum (requires downtime)
VACUUM FULL;
```

### Index Maintenance
```sql
-- Rebuild indexes
REINDEX TABLE audit_logs;

-- Check index usage
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;
```

### Expired Session Cleanup
```sql
-- Delete expired sessions
DELETE FROM sessions WHERE expires_at < NOW();
```

### Expired Lock Cleanup
```sql
-- Delete expired editing locks
DELETE FROM editing_locks WHERE expires_at < NOW();
```

---

## Protocol Assistant Tables

The Protocol Assistant is an AI-powered service for protocol review, gap analysis, and document generation. It runs on the same PostgreSQL database (port 5434) but uses separate tables with distinct functionality.

### Chat & Sessions

#### chat_sessions

Represents a chat session between a user and the Protocol Assistant. Each session tracks the context of a protocol review conversation, including extracted protocol data, identified gaps, and collected answers.

```sql
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    institution_id UUID,
    uploaded_document_id VARCHAR(255),
    document_filename VARCHAR(500),
    extracted_protocol JSONB,
    current_gaps JSONB,
    collected_answers JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'active',
    completion_percentage INTEGER DEFAULT 0,
    title VARCHAR(500),
    summary TEXT,
    llm_provider VARCHAR(50),
    total_tokens_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX ix_chat_sessions_project_user ON chat_sessions(project_id, user_id);
CREATE INDEX ix_chat_sessions_status ON chat_sessions(status);
CREATE INDEX ix_chat_sessions_created_at ON chat_sessions(created_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique session identifier |
| project_id | UUID | NOT NULL | - | Reference to projects table |
| user_id | UUID | NOT NULL | - | Reference to users table |
| institution_id | UUID | - | NULL | Institution scope for multi-tenancy |
| uploaded_document_id | VARCHAR(255) | - | NULL | Reference to uploaded protocol document |
| document_filename | VARCHAR(500) | - | NULL | Original uploaded filename |
| extracted_protocol | JSONB | - | NULL | Structured protocol data extracted by AI |
| current_gaps | JSONB | - | NULL | List of identified gaps in protocol |
| collected_answers | JSONB | - | '{}' | User responses to gap questions |
| status | VARCHAR(50) | - | 'active' | Session status: active, completed, abandoned, handed_off |
| completion_percentage | INTEGER | - | 0 | Progress indicator (0-100) |
| title | VARCHAR(500) | - | NULL | Session title for display |
| summary | TEXT | - | NULL | AI-generated session summary |
| llm_provider | VARCHAR(50) | - | NULL | LLM provider used (claude, openai, etc.) |
| total_tokens_used | INTEGER | - | 0 | Cumulative token usage |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Session creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |
| completed_at | TIMESTAMP WITH TIME ZONE | - | NULL | Session completion timestamp |

**Relationships:**
- `messages` -> `chat_messages` (one-to-many)
- `generated_documents` -> `generated_documents` (one-to-many)
- `feedback` -> `ai_feedback` (one-to-many)
- `handoffs` -> `session_handoffs` (one-to-many)
- `provenance_nodes` -> `provenance_nodes` (one-to-many)

**Indexes:**
- `ix_chat_sessions_project_user` - Combined project and user lookups
- `ix_chat_sessions_status` - Status filtering
- `ix_chat_sessions_created_at` - Chronological sorting

---

#### chat_messages

Individual messages within a chat session. Supports different message types including regular chat, questions, suggestions, and action messages.

```sql
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'chat',
    metadata JSONB,
    prompt_version_id INTEGER REFERENCES prompt_versions(id),
    tokens_used INTEGER,
    gap_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_chat_messages_session_created ON chat_messages(session_id, created_at);
CREATE INDEX ix_chat_messages_role ON chat_messages(role);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique message identifier |
| session_id | UUID | NOT NULL, FK | - | Reference to chat_sessions |
| role | VARCHAR(20) | NOT NULL | - | Message role: user, assistant, system |
| content | TEXT | NOT NULL | - | Message content |
| message_type | VARCHAR(50) | - | 'chat' | Type: chat, question, suggestion, action, error |
| metadata | JSONB | - | NULL | Flexible additional data |
| prompt_version_id | INTEGER | FK | NULL | Reference to prompt version used |
| tokens_used | INTEGER | - | NULL | Token count for this message |
| gap_id | VARCHAR(100) | - | NULL | Reference to specific gap being addressed |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Message timestamp |

**Foreign Keys:**
- `session_id` -> `chat_sessions(id)` ON DELETE CASCADE
- `prompt_version_id` -> `prompt_versions(id)`

**Indexes:**
- `ix_chat_messages_session_created` - Session message ordering
- `ix_chat_messages_role` - Role-based filtering

---

### Generated Documents

#### generated_documents

Stores AI-generated documents such as protocols, consent forms, and other research documents. Documents can be versioned, reviewed, and exported in multiple formats.

```sql
CREATE TABLE generated_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    institution_id UUID,
    document_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    version INTEGER DEFAULT 1,
    version_label VARCHAR(100),
    content TEXT NOT NULL,
    content_html TEXT,
    content_format VARCHAR(50) DEFAULT 'markdown',
    template_id UUID,
    template_version INTEGER,
    generation_metadata JSONB,
    source_data JSONB,
    status VARCHAR(50) DEFAULT 'draft',
    is_latest BOOLEAN DEFAULT true,
    reviewed_by UUID,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    quality_score INTEGER,
    coherence_score INTEGER,
    completeness_score INTEGER,
    content_hash VARCHAR(64),
    parent_document_id UUID REFERENCES generated_documents(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT ck_generated_documents_version_positive CHECK (version > 0),
    CONSTRAINT ck_generated_documents_quality_score_range CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100))
);

CREATE INDEX ix_generated_documents_project_type ON generated_documents(project_id, document_type);
CREATE INDEX ix_generated_documents_status ON generated_documents(status);
CREATE INDEX ix_generated_documents_created_at ON generated_documents(created_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique document identifier |
| session_id | UUID | FK | NULL | Reference to originating chat session |
| project_id | UUID | NOT NULL | - | Reference to projects table |
| user_id | UUID | NOT NULL | - | Document creator |
| institution_id | UUID | - | NULL | Institution scope |
| document_type | VARCHAR(100) | NOT NULL | - | Type: protocol, consent_form, amendment, etc. |
| title | VARCHAR(500) | NOT NULL | - | Document title |
| version | INTEGER | CHECK > 0 | 1 | Version number |
| version_label | VARCHAR(100) | - | NULL | Human-readable version label |
| content | TEXT | NOT NULL | - | Primary document content (markdown/text) |
| content_html | TEXT | - | NULL | Rendered HTML version |
| content_format | VARCHAR(50) | - | 'markdown' | Content format: markdown, html, plain |
| template_id | UUID | - | NULL | Reference to template used |
| template_version | INTEGER | - | NULL | Template version used |
| generation_metadata | JSONB | - | NULL | LLM params, prompt info, etc. |
| source_data | JSONB | - | NULL | Input data used for generation |
| status | VARCHAR(50) | - | 'draft' | Status: draft, review, approved, final, archived |
| is_latest | BOOLEAN | - | true | Latest version flag |
| reviewed_by | UUID | - | NULL | Reviewer user ID |
| reviewed_at | TIMESTAMP WITH TIME ZONE | - | NULL | Review timestamp |
| review_notes | TEXT | - | NULL | Reviewer notes |
| quality_score | INTEGER | CHECK 0-100 | NULL | AI-assessed quality score |
| coherence_score | INTEGER | - | NULL | Coherence check score |
| completeness_score | INTEGER | - | NULL | Completeness check score |
| content_hash | VARCHAR(64) | - | NULL | SHA-256 hash for integrity |
| parent_document_id | UUID | FK | NULL | Parent document for versioning |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Foreign Keys:**
- `session_id` -> `chat_sessions(id)` ON DELETE SET NULL
- `parent_document_id` -> `generated_documents(id)` ON DELETE SET NULL (self-referential)

**Indexes:**
- `ix_generated_documents_project_type` - Project and type filtering
- `ix_generated_documents_status` - Status filtering
- `ix_generated_documents_created_at` - Chronological sorting

---

### Institution Configuration

#### institution_feature_flags

Feature flags and configuration for each institution. Controls which AI features are enabled, LLM provider settings, rate limits, and integration configurations.

```sql
CREATE TABLE institution_feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL UNIQUE,
    institution_name VARCHAR(500),
    ai_assistant_enabled BOOLEAN DEFAULT true,
    document_extraction_enabled BOOLEAN DEFAULT true,
    gap_analysis_enabled BOOLEAN DEFAULT true,
    document_generation_enabled BOOLEAN DEFAULT true,
    form_prefill_enabled BOOLEAN DEFAULT true,
    coherence_checking_enabled BOOLEAN DEFAULT true,
    allowed_llm_providers VARCHAR[] DEFAULT ARRAY['claude'],
    default_llm_provider VARCHAR(50) DEFAULT 'claude',
    fallback_behavior VARCHAR(50) DEFAULT 'error',
    max_retries INTEGER DEFAULT 3,
    daily_request_limit INTEGER DEFAULT 1000,
    monthly_token_budget INTEGER DEFAULT 1000000,
    max_document_size_mb INTEGER DEFAULT 50,
    max_concurrent_sessions INTEGER DEFAULT 100,
    integrations_enabled JSONB DEFAULT '{}',
    custom_prompts_enabled BOOLEAN DEFAULT false,
    rag_knowledge_base_enabled BOOLEAN DEFAULT false,
    ab_testing_enabled BOOLEAN DEFAULT true,
    advanced_analytics_enabled BOOLEAN DEFAULT false,
    audit_log_retention_days INTEGER DEFAULT 2555,
    require_electronic_signatures BOOLEAN DEFAULT false,
    cfr_part_11_compliant BOOLEAN DEFAULT false,
    custom_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT ck_institution_daily_limit_positive CHECK (daily_request_limit > 0),
    CONSTRAINT ck_institution_monthly_budget_positive CHECK (monthly_token_budget > 0),
    CONSTRAINT ck_institution_max_doc_size_positive CHECK (max_document_size_mb > 0),
    CONSTRAINT ck_institution_max_retries_non_negative CHECK (max_retries >= 0)
);

CREATE UNIQUE INDEX ix_institution_feature_flags_institution_id ON institution_feature_flags(institution_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique identifier |
| institution_id | UUID | UNIQUE, NOT NULL | - | Institution reference |
| institution_name | VARCHAR(500) | - | NULL | Institution display name |
| ai_assistant_enabled | BOOLEAN | - | true | Enable AI assistant feature |
| document_extraction_enabled | BOOLEAN | - | true | Enable document extraction |
| gap_analysis_enabled | BOOLEAN | - | true | Enable gap analysis |
| document_generation_enabled | BOOLEAN | - | true | Enable document generation |
| form_prefill_enabled | BOOLEAN | - | true | Enable form prefill |
| coherence_checking_enabled | BOOLEAN | - | true | Enable coherence checking |
| allowed_llm_providers | VARCHAR[] | - | ['claude'] | Allowed LLM providers |
| default_llm_provider | VARCHAR(50) | - | 'claude' | Default LLM provider |
| fallback_behavior | VARCHAR(50) | - | 'error' | Fallback: error, queue, alternate |
| max_retries | INTEGER | CHECK >= 0 | 3 | Maximum retry attempts |
| daily_request_limit | INTEGER | CHECK > 0 | 1000 | Daily request limit |
| monthly_token_budget | INTEGER | CHECK > 0 | 1000000 | Monthly token budget |
| max_document_size_mb | INTEGER | CHECK > 0 | 50 | Max document size in MB |
| max_concurrent_sessions | INTEGER | - | 100 | Max concurrent sessions |
| integrations_enabled | JSONB | - | '{}' | Enabled integrations map |
| custom_prompts_enabled | BOOLEAN | - | false | Allow custom prompts |
| rag_knowledge_base_enabled | BOOLEAN | - | false | Enable RAG knowledge base |
| ab_testing_enabled | BOOLEAN | - | true | Enable A/B testing |
| advanced_analytics_enabled | BOOLEAN | - | false | Enable advanced analytics |
| audit_log_retention_days | INTEGER | - | 2555 | Audit log retention (~7 years) |
| require_electronic_signatures | BOOLEAN | - | false | Require e-signatures |
| cfr_part_11_compliant | BOOLEAN | - | false | 21 CFR Part 11 compliance mode |
| custom_config | JSONB | - | NULL | Institution-specific settings |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Relationships:**
- `knowledge_documents` -> `knowledge_documents` (one-to-many)
- `usage_analytics` -> `usage_analytics` (one-to-many)
- `compliance_logs` -> `compliance_audit_log` (one-to-many)

---

### A/B Testing & Learning

#### prompt_versions

Stores different versions of prompts for A/B testing. Enables controlled rollout of prompt changes and measurement of their effectiveness.

```sql
CREATE TABLE prompt_versions (
    id SERIAL PRIMARY KEY,
    prompt_key VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    name VARCHAR(200),
    description TEXT,
    content TEXT NOT NULL,
    system_prompt TEXT,
    parameters JSONB,
    traffic_percentage FLOAT DEFAULT 0.0,
    is_active BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    success_rate FLOAT,
    avg_quality_score FLOAT,
    avg_latency_ms FLOAT,
    sample_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    created_by UUID,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    retired_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_prompt_versions_key_version UNIQUE (prompt_key, version),
    CONSTRAINT ck_prompt_versions_traffic_percentage_range CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100),
    CONSTRAINT ck_prompt_versions_version_positive CHECK (version > 0)
);

CREATE INDEX ix_prompt_versions_active ON prompt_versions(is_active);
CREATE INDEX ix_prompt_versions_key_active ON prompt_versions(prompt_key, is_active);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique version identifier |
| prompt_key | VARCHAR(100) | NOT NULL | - | Prompt identifier (e.g., "gap_analysis") |
| version | INTEGER | NOT NULL, CHECK > 0 | - | Version number |
| name | VARCHAR(200) | - | NULL | Human-readable version name |
| description | TEXT | - | NULL | Version description |
| content | TEXT | NOT NULL | - | The actual prompt template |
| system_prompt | TEXT | - | NULL | System prompt if separate |
| parameters | JSONB | - | NULL | LLM parameters (temperature, etc.) |
| traffic_percentage | FLOAT | CHECK 0-100 | 0.0 | Percentage of traffic |
| is_active | BOOLEAN | - | false | Currently active flag |
| is_default | BOOLEAN | - | false | Fallback version flag |
| success_rate | FLOAT | - | NULL | Percentage of successful outputs |
| avg_quality_score | FLOAT | - | NULL | Average quality rating |
| avg_latency_ms | FLOAT | - | NULL | Average response time |
| sample_count | INTEGER | - | 0 | Number of uses |
| error_count | INTEGER | - | 0 | Number of errors |
| created_by | UUID | - | NULL | Creator user ID |
| approved_by | UUID | - | NULL | Approver user ID |
| approved_at | TIMESTAMP WITH TIME ZONE | - | NULL | Approval timestamp |
| retired_at | TIMESTAMP WITH TIME ZONE | - | NULL | Retirement timestamp |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Unique Constraint:** `(prompt_key, version)` - Unique version per prompt

**Indexes:**
- `ix_prompt_versions_active` - Active version filtering
- `ix_prompt_versions_key_active` - Key and active filtering

---

#### ai_feedback

User feedback on AI-generated outputs. Captures ratings, comments, and corrections for continuous improvement.

```sql
CREATE TABLE ai_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    output_id VARCHAR(255),
    message_id INTEGER REFERENCES chat_messages(id) ON DELETE SET NULL,
    document_id UUID REFERENCES generated_documents(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    institution_id UUID,
    rating INTEGER,
    feedback_type VARCHAR(50) NOT NULL,
    comment TEXT,
    corrections JSONB,
    original_content TEXT,
    corrected_content TEXT,
    prompt_version_id INTEGER REFERENCES prompt_versions(id) ON DELETE SET NULL,
    issue_category VARCHAR(100),
    severity VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT ck_ai_feedback_rating_range CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5))
);

CREATE INDEX ix_ai_feedback_user_created ON ai_feedback(user_id, created_at);
CREATE INDEX ix_ai_feedback_type ON ai_feedback(feedback_type);
CREATE INDEX ix_ai_feedback_rating ON ai_feedback(rating);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique feedback identifier |
| session_id | UUID | FK | NULL | Reference to chat session |
| output_id | VARCHAR(255) | - | NULL | Reference to specific output |
| message_id | INTEGER | FK | NULL | Reference to chat message |
| document_id | UUID | FK | NULL | Reference to generated document |
| user_id | UUID | NOT NULL | - | User providing feedback |
| institution_id | UUID | - | NULL | Institution scope |
| rating | INTEGER | CHECK 1-5 | NULL | Rating on 1-5 scale |
| feedback_type | VARCHAR(50) | NOT NULL | - | Type: quality, accuracy, helpfulness, relevance |
| comment | TEXT | - | NULL | User comment |
| corrections | JSONB | - | NULL | Structured corrections |
| original_content | TEXT | - | NULL | Original AI output |
| corrected_content | TEXT | - | NULL | User-corrected version |
| prompt_version_id | INTEGER | FK | NULL | Prompt version used |
| issue_category | VARCHAR(100) | - | NULL | Category: factual_error, formatting, tone, etc. |
| severity | VARCHAR(20) | - | NULL | Severity: low, medium, high, critical |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Feedback timestamp |

**Foreign Keys:**
- `session_id` -> `chat_sessions(id)` ON DELETE SET NULL
- `message_id` -> `chat_messages(id)` ON DELETE SET NULL
- `document_id` -> `generated_documents(id)` ON DELETE SET NULL
- `prompt_version_id` -> `prompt_versions(id)` ON DELETE SET NULL

**Indexes:**
- `ix_ai_feedback_user_created` - User feedback history
- `ix_ai_feedback_type` - Type filtering
- `ix_ai_feedback_rating` - Rating filtering

---

### Audit & Compliance

#### provenance_nodes

Tracks the lineage of AI-generated outputs. Creates an audit trail showing how data flows through the system, from input documents through extraction, generation, and editing.

```sql
CREATE TABLE provenance_nodes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    project_id UUID,
    type VARCHAR(50) NOT NULL,
    actor VARCHAR(255) NOT NULL,
    actor_type VARCHAR(50) DEFAULT 'user',
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    data_hash VARCHAR(64) NOT NULL,
    parent_ids UUID[] DEFAULT '{}',
    depth INTEGER DEFAULT 0,
    metadata JSONB,
    llm_provider VARCHAR(50),
    llm_model VARCHAR(100),
    prompt_version_id INTEGER,
    action VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_provenance_nodes_type ON provenance_nodes(type);
CREATE INDEX ix_provenance_nodes_actor ON provenance_nodes(actor);
CREATE INDEX ix_provenance_nodes_resource ON provenance_nodes(resource_type, resource_id);
CREATE INDEX ix_provenance_nodes_created_at ON provenance_nodes(created_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique node identifier |
| session_id | UUID | FK | NULL | Reference to chat session |
| project_id | UUID | - | NULL | Project scope |
| type | VARCHAR(50) | NOT NULL | - | Node type: input, extraction, generation, edit, approval, review |
| actor | VARCHAR(255) | NOT NULL | - | Actor: user_id, "system", or "llm:{provider}" |
| actor_type | VARCHAR(50) | - | 'user' | Actor type: user, system, llm |
| resource_type | VARCHAR(100) | - | NULL | Resource type: document, message, section |
| resource_id | VARCHAR(255) | - | NULL | Resource identifier |
| data_hash | VARCHAR(64) | NOT NULL | - | SHA-256 hash of content |
| parent_ids | UUID[] | - | '{}' | Parent nodes in lineage chain |
| depth | INTEGER | - | 0 | Depth in provenance tree |
| metadata | JSONB | - | NULL | Additional context |
| llm_provider | VARCHAR(50) | - | NULL | LLM provider if AI-generated |
| llm_model | VARCHAR(100) | - | NULL | LLM model used |
| prompt_version_id | INTEGER | - | NULL | Prompt version used |
| action | VARCHAR(100) | - | NULL | Specific action taken |
| description | TEXT | - | NULL | Human-readable description |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Node creation timestamp |

**Foreign Keys:**
- `session_id` -> `chat_sessions(id)` ON DELETE SET NULL

**Indexes:**
- `ix_provenance_nodes_type` - Type filtering
- `ix_provenance_nodes_actor` - Actor lookups
- `ix_provenance_nodes_resource` - Resource tracking
- `ix_provenance_nodes_created_at` - Chronological sorting

---

#### compliance_audit_log

Append-only compliance audit log for regulatory requirements including HIPAA, 21 CFR Part 11, and institutional policies.

```sql
CREATE TABLE compliance_audit_log (
    id SERIAL PRIMARY KEY,
    institution_id UUID REFERENCES institution_feature_flags(institution_id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    actor_id UUID,
    actor_name VARCHAR(255),
    actor_email VARCHAR(255),
    actor_role VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    action_detail TEXT,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX ix_compliance_audit_log_event_type ON compliance_audit_log(event_type);
CREATE INDEX ix_compliance_audit_log_timestamp ON compliance_audit_log(timestamp);
CREATE INDEX ix_compliance_audit_log_actor_timestamp ON compliance_audit_log(actor_id, timestamp);
CREATE INDEX ix_compliance_audit_log_resource ON compliance_audit_log(resource_type, resource_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | SERIAL | PRIMARY KEY | auto-increment | Unique log entry identifier |
| institution_id | UUID | FK | NULL | Institution scope |
| event_type | VARCHAR(100) | NOT NULL | - | Event type: access, create, update, delete, export, login, etc. |
| resource_type | VARCHAR(100) | NOT NULL | - | Resource type: document, session, user, etc. |
| resource_id | VARCHAR(255) | - | NULL | Resource identifier |
| actor_id | UUID | - | NULL | User who performed action |
| actor_name | VARCHAR(255) | - | NULL | Actor name at time of action |
| actor_email | VARCHAR(255) | - | NULL | Actor email at time of action |
| actor_role | VARCHAR(100) | - | NULL | Actor role at time of action |
| action | VARCHAR(100) | NOT NULL | - | Action performed |
| action_detail | TEXT | - | NULL | Action description |
| details | JSONB | - | NULL | Structured details |
| ip_address | INET | - | NULL | Client IP address |
| user_agent | TEXT | - | NULL | Client user agent |
| request_id | VARCHAR(100) | - | NULL | Request ID for tracing |
| success | BOOLEAN | - | true | Action success status |
| error_message | TEXT | - | NULL | Error message if failed |
| timestamp | TIMESTAMP WITH TIME ZONE | NOT NULL | NOW() | Action timestamp (immutable) |

**Foreign Keys:**
- `institution_id` -> `institution_feature_flags(institution_id)` ON DELETE SET NULL

**Indexes:**
- `ix_compliance_audit_log_event_type` - Event type filtering
- `ix_compliance_audit_log_timestamp` - Chronological sorting
- `ix_compliance_audit_log_actor_timestamp` - Actor activity history
- `ix_compliance_audit_log_resource` - Resource audit trail

---

#### electronic_signatures

Electronic signatures for 21 CFR Part 11 compliance. Captures legally binding signatures with all required metadata for regulatory compliance.

```sql
CREATE TABLE electronic_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES generated_documents(id) ON DELETE CASCADE,
    document_version INTEGER NOT NULL,
    document_hash VARCHAR(64) NOT NULL,
    signer_id UUID NOT NULL,
    signer_name VARCHAR(255) NOT NULL,
    signer_email VARCHAR(255) NOT NULL,
    signer_title VARCHAR(255),
    signer_institution VARCHAR(500),
    meaning VARCHAR(100) NOT NULL,
    statement TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC' NOT NULL,
    timestamp_utc TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    system_id VARCHAR(100) NOT NULL,
    system_version VARCHAR(50),
    signature_hash VARCHAR(128) NOT NULL,
    signature_algorithm VARCHAR(50) DEFAULT 'SHA-256',
    public_key_fingerprint VARCHAR(128),
    auth_method VARCHAR(50) NOT NULL,
    auth_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address INET,
    user_agent TEXT,
    is_valid BOOLEAN DEFAULT true,
    invalidated_at TIMESTAMP WITH TIME ZONE,
    invalidation_reason TEXT,
    CONSTRAINT ck_electronic_signatures_meaning_valid CHECK (meaning IN ('approval', 'review', 'author', 'witness', 'acknowledgment'))
);

CREATE INDEX ix_electronic_signatures_signer ON electronic_signatures(signer_id);
CREATE INDEX ix_electronic_signatures_document_signer ON electronic_signatures(document_id, signer_id);
CREATE INDEX ix_electronic_signatures_timestamp ON electronic_signatures(timestamp);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique signature identifier |
| document_id | UUID | NOT NULL, FK | - | Reference to generated document |
| document_version | INTEGER | NOT NULL | - | Document version at signing |
| document_hash | VARCHAR(64) | NOT NULL | - | SHA-256 hash of document at signing |
| signer_id | UUID | NOT NULL | - | Signer user ID |
| signer_name | VARCHAR(255) | NOT NULL | - | Full name at time of signing |
| signer_email | VARCHAR(255) | NOT NULL | - | Email at time of signing |
| signer_title | VARCHAR(255) | - | NULL | Title at time of signing |
| signer_institution | VARCHAR(500) | - | NULL | Institution at time of signing |
| meaning | VARCHAR(100) | NOT NULL, CHECK | - | Signature meaning: approval, review, author, witness, acknowledgment |
| statement | TEXT | - | NULL | Optional statement with signature |
| timestamp | TIMESTAMP WITH TIME ZONE | NOT NULL | NOW() | Signing timestamp |
| timezone | VARCHAR(50) | NOT NULL | 'UTC' | Signer's timezone |
| timestamp_utc | TIMESTAMP WITH TIME ZONE | NOT NULL | NOW() | UTC normalized timestamp |
| system_id | VARCHAR(100) | NOT NULL | - | Unique system identifier |
| system_version | VARCHAR(50) | - | NULL | System version |
| signature_hash | VARCHAR(128) | NOT NULL | - | Hash of signature data |
| signature_algorithm | VARCHAR(50) | - | 'SHA-256' | Hash algorithm used |
| public_key_fingerprint | VARCHAR(128) | - | NULL | PKI fingerprint if using certificates |
| auth_method | VARCHAR(50) | NOT NULL | - | Authentication method: password, mfa, biometric, certificate |
| auth_timestamp | TIMESTAMP WITH TIME ZONE | NOT NULL | - | Authentication timestamp |
| ip_address | INET | - | NULL | Client IP address |
| user_agent | TEXT | - | NULL | Client user agent |
| is_valid | BOOLEAN | - | true | Signature validity status |
| invalidated_at | TIMESTAMP WITH TIME ZONE | - | NULL | Invalidation timestamp |
| invalidation_reason | TEXT | - | NULL | Reason for invalidation |

**Foreign Keys:**
- `document_id` -> `generated_documents(id)` ON DELETE CASCADE

**Indexes:**
- `ix_electronic_signatures_signer` - Signer lookups
- `ix_electronic_signatures_document_signer` - Document signature lookups
- `ix_electronic_signatures_timestamp` - Chronological sorting

---

### Collaboration

#### session_handoffs

Tracks handoffs of chat sessions between users. Enables collaboration by allowing users to transfer sessions to colleagues with context and notes.

```sql
CREATE TABLE session_handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL,
    from_user_name VARCHAR(255),
    to_user_id UUID NOT NULL,
    to_user_name VARCHAR(255),
    to_user_email VARCHAR(255),
    handoff_note TEXT,
    handoff_reason VARCHAR(100),
    session_snapshot JSONB,
    completion_at_handoff INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    response_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_session_handoffs_status_valid CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'))
);

CREATE INDEX ix_session_handoffs_from_user ON session_handoffs(from_user_id);
CREATE INDEX ix_session_handoffs_to_user ON session_handoffs(to_user_id);
CREATE INDEX ix_session_handoffs_status ON session_handoffs(status);
CREATE INDEX ix_session_handoffs_created_at ON session_handoffs(created_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique handoff identifier |
| session_id | UUID | NOT NULL, FK | - | Reference to chat session |
| from_user_id | UUID | NOT NULL | - | User initiating handoff |
| from_user_name | VARCHAR(255) | - | NULL | Sender name at handoff time |
| to_user_id | UUID | NOT NULL | - | User receiving handoff |
| to_user_name | VARCHAR(255) | - | NULL | Recipient name |
| to_user_email | VARCHAR(255) | - | NULL | Recipient email |
| handoff_note | TEXT | - | NULL | Message from sender |
| handoff_reason | VARCHAR(100) | - | NULL | Reason: collaboration, expertise_needed, unavailable |
| session_snapshot | JSONB | - | NULL | Session state at handoff |
| completion_at_handoff | INTEGER | - | NULL | Completion percentage when handed off |
| status | VARCHAR(50) | CHECK | 'pending' | Status: pending, accepted, declined, expired, cancelled |
| response_note | TEXT | - | NULL | Response from recipient |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Handoff creation timestamp |
| responded_at | TIMESTAMP WITH TIME ZONE | - | NULL | Response timestamp |
| expires_at | TIMESTAMP WITH TIME ZONE | - | NULL | Optional expiration time |

**Foreign Keys:**
- `session_id` -> `chat_sessions(id)` ON DELETE CASCADE

**Indexes:**
- `ix_session_handoffs_from_user` - Outgoing handoff lookups
- `ix_session_handoffs_to_user` - Incoming handoff lookups
- `ix_session_handoffs_status` - Status filtering
- `ix_session_handoffs_created_at` - Chronological sorting

---

#### session_collaborators

Tracks users who have access to collaborate on a session. Supports multi-user collaboration with different permission levels.

```sql
CREATE TABLE session_collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    role VARCHAR(50) DEFAULT 'viewer',
    can_edit VARCHAR(50) DEFAULT 'false',
    can_invite VARCHAR(50) DEFAULT 'false',
    invited_by UUID,
    invitation_status VARCHAR(50) DEFAULT 'accepted',
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    contribution_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT ck_session_collaborators_role_valid CHECK (role IN ('owner', 'editor', 'viewer', 'commenter'))
);

CREATE UNIQUE INDEX ix_session_collaborators_session_user ON session_collaborators(session_id, user_id);
CREATE INDEX ix_session_collaborators_role ON session_collaborators(role);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique collaborator entry identifier |
| session_id | UUID | NOT NULL, FK | - | Reference to chat session |
| user_id | UUID | NOT NULL | - | Collaborator user ID |
| user_name | VARCHAR(255) | - | NULL | Collaborator name |
| user_email | VARCHAR(255) | - | NULL | Collaborator email |
| role | VARCHAR(50) | CHECK | 'viewer' | Role: owner, editor, viewer, commenter |
| can_edit | VARCHAR(50) | - | 'false' | Edit permission |
| can_invite | VARCHAR(50) | - | 'false' | Invite permission |
| invited_by | UUID | - | NULL | User who invited collaborator |
| invitation_status | VARCHAR(50) | - | 'accepted' | Status: pending, accepted, declined |
| last_accessed_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last access timestamp |
| contribution_count | INTEGER | - | 0 | Number of contributions |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Foreign Keys:**
- `session_id` -> `chat_sessions(id)` ON DELETE CASCADE

**Unique Constraint:** `(session_id, user_id)` - One entry per user per session

**Indexes:**
- `ix_session_collaborators_session_user` - Session collaborator lookups (unique)
- `ix_session_collaborators_role` - Role filtering

---

### Knowledge Base (RAG)

#### knowledge_documents

Stores knowledge base documents for RAG (Retrieval-Augmented Generation). These documents provide context for the AI assistant, including institutional guidelines, templates, and reference materials.

```sql
CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institution_feature_flags(institution_id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    source_url VARCHAR(1000),
    source_filename VARCHAR(500),
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text',
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags JSONB DEFAULT '[]',
    embedding_model VARCHAR(100),
    has_embeddings BOOLEAN DEFAULT false,
    chunk_index INTEGER,
    parent_document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    chunk_count INTEGER,
    metadata JSONB,
    language VARCHAR(10) DEFAULT 'en',
    word_count INTEGER,
    version INTEGER DEFAULT 1,
    is_latest BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    added_by UUID,
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_indexed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_knowledge_documents_version_positive CHECK (version > 0)
);

CREATE INDEX ix_knowledge_documents_category ON knowledge_documents(category);
CREATE INDEX ix_knowledge_documents_active ON knowledge_documents(is_active);
CREATE INDEX ix_knowledge_documents_institution_category ON knowledge_documents(institution_id, category);
CREATE INDEX ix_knowledge_documents_embeddings ON knowledge_documents(has_embeddings);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique document identifier |
| institution_id | UUID | FK | NULL | Institution scope (NULL = global) |
| title | VARCHAR(500) | NOT NULL | - | Document title |
| description | TEXT | - | NULL | Document description |
| source_url | VARCHAR(1000) | - | NULL | Source URL |
| source_filename | VARCHAR(500) | - | NULL | Original filename |
| content | TEXT | NOT NULL | - | Document content |
| content_type | VARCHAR(50) | - | 'text' | Content type: text, markdown, html |
| category | VARCHAR(100) | - | NULL | Category: guidelines, templates, regulations, etc. |
| subcategory | VARCHAR(100) | - | NULL | Subcategory |
| tags | JSONB | - | '[]' | List of tags |
| embedding_model | VARCHAR(100) | - | NULL | Model used for embeddings |
| has_embeddings | BOOLEAN | - | false | Whether embeddings exist |
| chunk_index | INTEGER | - | NULL | Chunk index if part of larger doc |
| parent_document_id | UUID | FK | NULL | Parent document for chunks |
| chunk_count | INTEGER | - | NULL | Total chunks if parent |
| metadata | JSONB | - | NULL | Additional metadata |
| language | VARCHAR(10) | - | 'en' | Document language |
| word_count | INTEGER | - | NULL | Word count |
| version | INTEGER | CHECK > 0 | 1 | Document version |
| is_latest | BOOLEAN | - | true | Latest version flag |
| is_active | BOOLEAN | - | true | Active status |
| is_public | BOOLEAN | - | false | Public visibility |
| added_by | UUID | - | NULL | User who added document |
| approved_by | UUID | - | NULL | Approver user ID |
| approved_at | TIMESTAMP WITH TIME ZONE | - | NULL | Approval timestamp |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |
| last_indexed_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last embedding update |

**Foreign Keys:**
- `institution_id` -> `institution_feature_flags(institution_id)` ON DELETE CASCADE
- `parent_document_id` -> `knowledge_documents(id)` ON DELETE CASCADE (self-referential)

**Indexes:**
- `ix_knowledge_documents_category` - Category filtering
- `ix_knowledge_documents_active` - Active document filtering
- `ix_knowledge_documents_institution_category` - Institution and category filtering
- `ix_knowledge_documents_embeddings` - Embedding status filtering

---

#### knowledge_queries

Logs queries made against the knowledge base. Used for analytics and improving retrieval relevance.

```sql
CREATE TABLE knowledge_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID,
    user_id UUID,
    institution_id UUID,
    query_text TEXT NOT NULL,
    query_type VARCHAR(50) DEFAULT 'semantic',
    result_count INTEGER,
    result_document_ids JSONB,
    top_similarity_score VARCHAR(20),
    latency_ms INTEGER,
    was_helpful BOOLEAN,
    user_feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_knowledge_queries_created_at ON knowledge_queries(created_at);
CREATE INDEX ix_knowledge_queries_type ON knowledge_queries(query_type);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique query identifier |
| session_id | UUID | - | NULL | Session context |
| user_id | UUID | - | NULL | User making query |
| institution_id | UUID | - | NULL | Institution scope |
| query_text | TEXT | NOT NULL | - | Query text |
| query_type | VARCHAR(50) | - | 'semantic' | Type: semantic, keyword, hybrid |
| result_count | INTEGER | - | NULL | Number of results returned |
| result_document_ids | JSONB | - | NULL | IDs of retrieved documents |
| top_similarity_score | VARCHAR(20) | - | NULL | Highest similarity score |
| latency_ms | INTEGER | - | NULL | Query latency |
| was_helpful | BOOLEAN | - | NULL | User helpfulness rating |
| user_feedback | TEXT | - | NULL | User feedback text |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Query timestamp |

**Indexes:**
- `ix_knowledge_queries_created_at` - Chronological sorting
- `ix_knowledge_queries_type` - Query type filtering

---

### Analytics

#### usage_analytics

Daily aggregate usage statistics per institution. Provides insights into feature usage, costs, and user activity.

```sql
CREATE TABLE usage_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institution_feature_flags(institution_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    session_count INTEGER DEFAULT 0,
    session_starts INTEGER DEFAULT 0,
    session_completions INTEGER DEFAULT 0,
    session_abandonments INTEGER DEFAULT 0,
    document_count INTEGER DEFAULT 0,
    documents_uploaded INTEGER DEFAULT 0,
    documents_extracted INTEGER DEFAULT 0,
    generation_count INTEGER DEFAULT 0,
    prefill_count INTEGER DEFAULT 0,
    gap_analyses_count INTEGER DEFAULT 0,
    coherence_checks_count INTEGER DEFAULT 0,
    token_count INTEGER DEFAULT 0,
    tokens_claude INTEGER DEFAULT 0,
    tokens_openai INTEGER DEFAULT 0,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    active_user_count INTEGER DEFAULT 0,
    unique_users JSONB DEFAULT '[]',
    avg_session_duration_seconds INTEGER,
    avg_response_time_ms INTEGER,
    completion_rate NUMERIC(5,2),
    error_count INTEGER DEFAULT 0,
    errors_by_type JSONB DEFAULT '{}',
    cost_claude NUMERIC(10,4) DEFAULT 0,
    cost_openai NUMERIC(10,4) DEFAULT 0,
    cost_total NUMERIC(10,4) DEFAULT 0,
    feature_usage JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_usage_analytics_institution_date UNIQUE (institution_id, date)
);

CREATE INDEX ix_usage_analytics_date ON usage_analytics(date);
CREATE INDEX ix_usage_analytics_institution_date ON usage_analytics(institution_id, date);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique analytics record identifier |
| institution_id | UUID | NOT NULL, FK | - | Institution reference |
| date | DATE | NOT NULL | - | Analytics date |
| session_count | INTEGER | - | 0 | Total sessions |
| session_starts | INTEGER | - | 0 | New sessions started |
| session_completions | INTEGER | - | 0 | Sessions completed |
| session_abandonments | INTEGER | - | 0 | Sessions abandoned |
| document_count | INTEGER | - | 0 | Total documents |
| documents_uploaded | INTEGER | - | 0 | Documents uploaded |
| documents_extracted | INTEGER | - | 0 | Documents extracted |
| generation_count | INTEGER | - | 0 | Document generations |
| prefill_count | INTEGER | - | 0 | Form prefills |
| gap_analyses_count | INTEGER | - | 0 | Gap analyses performed |
| coherence_checks_count | INTEGER | - | 0 | Coherence checks performed |
| token_count | INTEGER | - | 0 | Total tokens used |
| tokens_claude | INTEGER | - | 0 | Claude tokens used |
| tokens_openai | INTEGER | - | 0 | OpenAI tokens used |
| tokens_input | INTEGER | - | 0 | Input tokens |
| tokens_output | INTEGER | - | 0 | Output tokens |
| active_user_count | INTEGER | - | 0 | Active users count |
| unique_users | JSONB | - | '[]' | List of unique user IDs |
| avg_session_duration_seconds | INTEGER | - | NULL | Average session duration |
| avg_response_time_ms | INTEGER | - | NULL | Average response time |
| completion_rate | NUMERIC(5,2) | - | NULL | Completion rate percentage |
| error_count | INTEGER | - | 0 | Error count |
| errors_by_type | JSONB | - | '{}' | Errors by type |
| cost_claude | NUMERIC(10,4) | - | 0 | Claude API cost (USD) |
| cost_openai | NUMERIC(10,4) | - | 0 | OpenAI API cost (USD) |
| cost_total | NUMERIC(10,4) | - | 0 | Total cost (USD) |
| feature_usage | JSONB | - | '{}' | Feature usage breakdown |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Foreign Keys:**
- `institution_id` -> `institution_feature_flags(institution_id)` ON DELETE CASCADE

**Unique Constraint:** `(institution_id, date)` - One record per institution per day

**Indexes:**
- `ix_usage_analytics_date` - Date filtering
- `ix_usage_analytics_institution_date` - Institution and date filtering

---

#### user_activities

Individual user activity tracking. Records significant user actions for analytics and usage pattern analysis.

```sql
CREATE TABLE user_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    institution_id UUID,
    session_id UUID,
    activity_type VARCHAR(100) NOT NULL,
    activity_detail VARCHAR(255),
    metadata JSONB,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    duration_ms INTEGER,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_user_activities_type ON user_activities(activity_type);
CREATE INDEX ix_user_activities_user_created ON user_activities(user_id, created_at);
CREATE INDEX ix_user_activities_created_at ON user_activities(created_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique activity identifier |
| user_id | UUID | NOT NULL | - | User reference |
| institution_id | UUID | - | NULL | Institution scope |
| session_id | UUID | - | NULL | Session context |
| activity_type | VARCHAR(100) | NOT NULL | - | Type: session_start, document_upload, generation, etc. |
| activity_detail | VARCHAR(255) | - | NULL | Activity detail |
| metadata | JSONB | - | NULL | Additional metadata |
| resource_type | VARCHAR(100) | - | NULL | Resource type affected |
| resource_id | VARCHAR(255) | - | NULL | Resource identifier |
| duration_ms | INTEGER | - | NULL | Activity duration |
| success | BOOLEAN | - | true | Success status |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Activity timestamp |

**Indexes:**
- `ix_user_activities_type` - Activity type filtering
- `ix_user_activities_user_created` - User activity history
- `ix_user_activities_created_at` - Chronological sorting

---

#### feature_usage_metrics

Tracks usage of specific features for optimization and reporting.

```sql
CREATE TABLE feature_usage_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    user_id UUID,
    feature_name VARCHAR(100) NOT NULL,
    feature_version VARCHAR(50),
    invocation_count INTEGER DEFAULT 1,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    avg_latency_ms INTEGER,
    total_tokens INTEGER DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_feature_usage_metrics_feature ON feature_usage_metrics(feature_name);
CREATE INDEX ix_feature_usage_metrics_period ON feature_usage_metrics(period_start, period_end);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique metric identifier |
| institution_id | UUID | - | NULL | Institution scope |
| user_id | UUID | - | NULL | User scope |
| feature_name | VARCHAR(100) | NOT NULL | - | Feature name |
| feature_version | VARCHAR(50) | - | NULL | Feature version |
| invocation_count | INTEGER | - | 1 | Number of invocations |
| success_count | INTEGER | - | 0 | Successful invocations |
| error_count | INTEGER | - | 0 | Failed invocations |
| avg_latency_ms | INTEGER | - | NULL | Average latency |
| total_tokens | INTEGER | - | 0 | Total tokens used |
| period_start | TIMESTAMP WITH TIME ZONE | NOT NULL | - | Period start |
| period_end | TIMESTAMP WITH TIME ZONE | NOT NULL | - | Period end |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Indexes:**
- `ix_feature_usage_metrics_feature` - Feature filtering
- `ix_feature_usage_metrics_period` - Period filtering

---

### Integrations

#### user_integration_credentials

Stores encrypted credentials for external integrations. Supports OAuth tokens, API keys, and other authentication methods for services like REDCap, EHR systems, etc.

```sql
CREATE TABLE user_integration_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    institution_id UUID,
    provider VARCHAR(100) NOT NULL,
    provider_instance VARCHAR(255),
    credentials_encrypted BYTEA NOT NULL,
    encryption_key_id VARCHAR(100),
    encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
    token_type VARCHAR(50) DEFAULT 'oauth2',
    access_token_expires_at TIMESTAMP WITH TIME ZONE,
    refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    scopes JSONB DEFAULT '[]',
    permissions JSONB,
    is_active BOOLEAN DEFAULT true,
    is_valid BOOLEAN DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_user_integration_provider UNIQUE (user_id, provider, provider_instance)
);

CREATE INDEX ix_user_integration_credentials_provider ON user_integration_credentials(provider);
CREATE INDEX ix_user_integration_credentials_user_provider ON user_integration_credentials(user_id, provider);
CREATE INDEX ix_user_integration_credentials_expires ON user_integration_credentials(expires_at);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique credential identifier |
| user_id | UUID | NOT NULL | - | User reference |
| institution_id | UUID | - | NULL | Institution scope |
| provider | VARCHAR(100) | NOT NULL | - | Provider: redcap, epic, cerner, etc. |
| provider_instance | VARCHAR(255) | - | NULL | Specific instance URL/ID |
| credentials_encrypted | BYTEA | NOT NULL | - | Encrypted credentials |
| encryption_key_id | VARCHAR(100) | - | NULL | Reference to encryption key |
| encryption_algorithm | VARCHAR(50) | - | 'AES-256-GCM' | Encryption algorithm |
| token_type | VARCHAR(50) | - | 'oauth2' | Token type: oauth2, api_key, basic, certificate |
| access_token_expires_at | TIMESTAMP WITH TIME ZONE | - | NULL | Access token expiration |
| refresh_token_expires_at | TIMESTAMP WITH TIME ZONE | - | NULL | Refresh token expiration |
| expires_at | TIMESTAMP WITH TIME ZONE | - | NULL | General expiration |
| scopes | JSONB | - | '[]' | OAuth scopes granted |
| permissions | JSONB | - | NULL | Provider-specific permissions |
| is_active | BOOLEAN | - | true | Active status |
| is_valid | BOOLEAN | - | true | Validity status |
| last_used_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last usage timestamp |
| last_error | TEXT | - | NULL | Last error message |
| error_count | INTEGER | - | 0 | Error count |
| metadata | JSONB | - | NULL | Additional metadata |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Unique Constraint:** `(user_id, provider, provider_instance)` - One credential per user per provider instance

**Indexes:**
- `ix_user_integration_credentials_provider` - Provider filtering
- `ix_user_integration_credentials_user_provider` - User and provider filtering
- `ix_user_integration_credentials_expires` - Expiration tracking

---

#### institution_integrations

Institution-level integration configurations. Stores shared integration settings and credentials that apply to all users within an institution.

```sql
CREATE TABLE institution_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL,
    integration_type VARCHAR(100) NOT NULL,
    integration_name VARCHAR(255) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    endpoint_url VARCHAR(1000),
    credentials_encrypted BYTEA,
    encryption_key_id VARCHAR(100),
    is_enabled BOOLEAN DEFAULT true,
    is_configured BOOLEAN DEFAULT false,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    health_status VARCHAR(50) DEFAULT 'unknown',
    sync_enabled BOOLEAN DEFAULT false,
    sync_interval_minutes INTEGER,
    sync_config JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_institution_integration UNIQUE (institution_id, integration_type, provider)
);

CREATE INDEX ix_institution_integrations_type ON institution_integrations(integration_type);
CREATE INDEX ix_institution_integrations_enabled ON institution_integrations(is_enabled);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique integration identifier |
| institution_id | UUID | NOT NULL | - | Institution reference |
| integration_type | VARCHAR(100) | NOT NULL | - | Type: hl7_fhir, redcap, ehr, storage, etc. |
| integration_name | VARCHAR(255) | NOT NULL | - | Integration display name |
| provider | VARCHAR(100) | NOT NULL | - | Provider name |
| config | JSONB | NOT NULL | '{}' | Non-sensitive configuration |
| endpoint_url | VARCHAR(1000) | - | NULL | Integration endpoint URL |
| credentials_encrypted | BYTEA | - | NULL | Encrypted credentials |
| encryption_key_id | VARCHAR(100) | - | NULL | Encryption key reference |
| is_enabled | BOOLEAN | - | true | Enabled status |
| is_configured | BOOLEAN | - | false | Configuration complete status |
| last_sync_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last sync timestamp |
| last_error | TEXT | - | NULL | Last error message |
| health_status | VARCHAR(50) | - | 'unknown' | Health: healthy, degraded, error, unknown |
| sync_enabled | BOOLEAN | - | false | Sync enabled status |
| sync_interval_minutes | INTEGER | - | NULL | Sync interval |
| sync_config | JSONB | - | NULL | Sync configuration |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Unique Constraint:** `(institution_id, integration_type, provider)` - One integration per type per provider per institution

**Indexes:**
- `ix_institution_integrations_type` - Integration type filtering
- `ix_institution_integrations_enabled` - Enabled status filtering

---

#### webhook_endpoints

Webhook endpoints for receiving notifications from integrations.

```sql
CREATE TABLE webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID,
    integration_id UUID REFERENCES institution_integrations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(1000) NOT NULL,
    secret_key_encrypted BYTEA,
    events JSONB DEFAULT '[]',
    filters JSONB,
    is_active BOOLEAN DEFAULT true,
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_failure_at TIMESTAMP WITH TIME ZONE,
    failure_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX ix_webhook_endpoints_active ON webhook_endpoints(is_active);
CREATE INDEX ix_webhook_endpoints_institution ON webhook_endpoints(institution_id);
```

| Column | Type | Constraints | Default | Description |
|--------|------|-------------|---------|-------------|
| id | UUID | PRIMARY KEY | uuid_generate_v4() | Unique endpoint identifier |
| institution_id | UUID | - | NULL | Institution scope |
| integration_id | UUID | FK | NULL | Reference to institution integration |
| name | VARCHAR(255) | NOT NULL | - | Endpoint name |
| url | VARCHAR(1000) | NOT NULL | - | Webhook URL |
| secret_key_encrypted | BYTEA | - | NULL | Encrypted secret for signature verification |
| events | JSONB | - | '[]' | Events to listen for |
| filters | JSONB | - | NULL | Event filters |
| is_active | BOOLEAN | - | true | Active status |
| last_triggered_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last trigger timestamp |
| last_success_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last successful trigger |
| last_failure_at | TIMESTAMP WITH TIME ZONE | - | NULL | Last failed trigger |
| failure_count | INTEGER | - | 0 | Consecutive failure count |
| max_retries | INTEGER | - | 3 | Maximum retry attempts |
| retry_delay_seconds | INTEGER | - | 60 | Delay between retries |
| created_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Creation timestamp |
| updated_at | TIMESTAMP WITH TIME ZONE | - | NOW() | Last update timestamp |

**Foreign Keys:**
- `integration_id` -> `institution_integrations(id)` ON DELETE CASCADE

**Indexes:**
- `ix_webhook_endpoints_active` - Active endpoint filtering
- `ix_webhook_endpoints_institution` - Institution endpoint lookups

---

## Protocol Assistant Indexes Summary

| Table | Index Name | Columns | Purpose |
|-------|------------|---------|---------|
| chat_sessions | ix_chat_sessions_project_user | project_id, user_id | Combined project and user lookups |
| chat_sessions | ix_chat_sessions_status | status | Status filtering |
| chat_sessions | ix_chat_sessions_created_at | created_at | Chronological sorting |
| chat_messages | ix_chat_messages_session_created | session_id, created_at | Session message ordering |
| chat_messages | ix_chat_messages_role | role | Role-based filtering |
| generated_documents | ix_generated_documents_project_type | project_id, document_type | Project and type filtering |
| generated_documents | ix_generated_documents_status | status | Status filtering |
| generated_documents | ix_generated_documents_created_at | created_at | Chronological sorting |
| institution_feature_flags | ix_institution_feature_flags_institution_id | institution_id | Institution lookups (unique) |
| prompt_versions | ix_prompt_versions_active | is_active | Active version filtering |
| prompt_versions | ix_prompt_versions_key_active | prompt_key, is_active | Key and active filtering |
| ai_feedback | ix_ai_feedback_user_created | user_id, created_at | User feedback history |
| ai_feedback | ix_ai_feedback_type | feedback_type | Type filtering |
| ai_feedback | ix_ai_feedback_rating | rating | Rating filtering |
| provenance_nodes | ix_provenance_nodes_type | type | Type filtering |
| provenance_nodes | ix_provenance_nodes_actor | actor | Actor lookups |
| provenance_nodes | ix_provenance_nodes_resource | resource_type, resource_id | Resource tracking |
| provenance_nodes | ix_provenance_nodes_created_at | created_at | Chronological sorting |
| compliance_audit_log | ix_compliance_audit_log_event_type | event_type | Event type filtering |
| compliance_audit_log | ix_compliance_audit_log_timestamp | timestamp | Chronological sorting |
| compliance_audit_log | ix_compliance_audit_log_actor_timestamp | actor_id, timestamp | Actor activity history |
| compliance_audit_log | ix_compliance_audit_log_resource | resource_type, resource_id | Resource audit trail |
| electronic_signatures | ix_electronic_signatures_signer | signer_id | Signer lookups |
| electronic_signatures | ix_electronic_signatures_document_signer | document_id, signer_id | Document signature lookups |
| electronic_signatures | ix_electronic_signatures_timestamp | timestamp | Chronological sorting |
| session_handoffs | ix_session_handoffs_from_user | from_user_id | Outgoing handoff lookups |
| session_handoffs | ix_session_handoffs_to_user | to_user_id | Incoming handoff lookups |
| session_handoffs | ix_session_handoffs_status | status | Status filtering |
| session_handoffs | ix_session_handoffs_created_at | created_at | Chronological sorting |
| session_collaborators | ix_session_collaborators_session_user | session_id, user_id | Session collaborator lookups (unique) |
| session_collaborators | ix_session_collaborators_role | role | Role filtering |
| knowledge_documents | ix_knowledge_documents_category | category | Category filtering |
| knowledge_documents | ix_knowledge_documents_active | is_active | Active document filtering |
| knowledge_documents | ix_knowledge_documents_institution_category | institution_id, category | Institution and category filtering |
| knowledge_documents | ix_knowledge_documents_embeddings | has_embeddings | Embedding status filtering |
| knowledge_queries | ix_knowledge_queries_created_at | created_at | Chronological sorting |
| knowledge_queries | ix_knowledge_queries_type | query_type | Query type filtering |
| usage_analytics | ix_usage_analytics_date | date | Date filtering |
| usage_analytics | ix_usage_analytics_institution_date | institution_id, date | Institution and date filtering |
| user_activities | ix_user_activities_type | activity_type | Activity type filtering |
| user_activities | ix_user_activities_user_created | user_id, created_at | User activity history |
| user_activities | ix_user_activities_created_at | created_at | Chronological sorting |
| feature_usage_metrics | ix_feature_usage_metrics_feature | feature_name | Feature filtering |
| feature_usage_metrics | ix_feature_usage_metrics_period | period_start, period_end | Period filtering |
| user_integration_credentials | ix_user_integration_credentials_provider | provider | Provider filtering |
| user_integration_credentials | ix_user_integration_credentials_user_provider | user_id, provider | User and provider filtering |
| user_integration_credentials | ix_user_integration_credentials_expires | expires_at | Expiration tracking |
| institution_integrations | ix_institution_integrations_type | integration_type | Integration type filtering |
| institution_integrations | ix_institution_integrations_enabled | is_enabled | Enabled status filtering |
| webhook_endpoints | ix_webhook_endpoints_active | is_active | Active endpoint filtering |
| webhook_endpoints | ix_webhook_endpoints_institution | institution_id | Institution endpoint lookups |

---

*Last Updated: January 23, 2026*
