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

**Total Tables**: 21

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

*Last Updated: January 22, 2026*
