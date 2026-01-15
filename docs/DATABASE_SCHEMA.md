# Database Schema Documentation

This document provides a comprehensive reference for the PostgreSQL database schema used in the Radiology Research Platform.

---

## Overview

| Category | Tables | Purpose |
|----------|--------|---------|
| Identity & Auth | 2 | User accounts and sessions |
| Projects | 2 | Research project management |
| Templates | 1 | Form template storage |
| Forms | 4 | Form instances and versioning |
| Review | 3 | Review workflow |
| Collaboration | 5 | Comments and collaboration |
| Amendments | 2 | Post-approval changes |
| Files | 1 | File attachments |
| Tasks & Notifications | 4 | Task definitions, tasks, and notifications |
| Audit | 1 | HIPAA-compliant logging |

**Total Tables**: 25

---

## Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   users     │───┬───│  sessions   │       │  projects   │
└─────────────┘   │   └─────────────┘       └──────┬──────┘
      │           │                                │
      │           │   ┌─────────────────┐         │
      │           └───│project_collaborators│◄────┘
      │               └─────────────────┘
      │
      │   ┌─────────────┐       ┌─────────────┐
      ├───│  templates  │◄──────│form_instances│
      │   └─────────────┘       └──────┬──────┘
      │                                │
      │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
      │   │  form_data  │◄──┤             ├──▶│form_versions│
      │   └─────────────┘   │             │   └─────────────┘
      │                     │             │
      │   ┌─────────────┐   │             │   ┌─────────────┐
      └───│form_reviews │◄──┤             ├──▶│field_changes│
          └─────────────┘   │             │   └─────────────┘
                            │             │
          ┌─────────────┐   │             │   ┌─────────────┐
          │review_stages│◄──┤             ├──▶│review_actions│
          └─────────────┘   │             │   └─────────────┘
                            │             │
          ┌─────────────┐   │             │   ┌─────────────────┐
          │form_collabs │◄──┤             ├──▶│comment_threads  │
          └─────────────┘   │             │   └────────┬────────┘
                            │             │            │
          ┌─────────────┐   │             │   ┌────────▼────────┐
          │editing_locks│◄──┤             │   │    comments     │
          └─────────────┘   │             │   └─────────────────┘
                            │             │
          ┌─────────────┐   │             │   ┌─────────────┐
          │ amendments  │◄──┘             └──▶│    files    │
          └──────┬──────┘                     └─────────────┘
                 │
          ┌──────▼──────────────┐
          │amendment_field_changes│
          └─────────────────────┘

┌─────────────────────┐       ┌─────────────┐       ┌─────────────┐
│  task_definitions   │───┬───│   tasks     │       │notifications│
└─────────────────────┘   │   └─────────────┘       └─────────────┘
                          │
┌─────────────────────────▼───────────────┐         ┌─────────────┐
│  project_type_task_mappings             │         │ audit_logs  │
└─────────────────────────────────────────┘         └─────────────┘
```

---

## Table Definitions

### Users & Authentication

#### users
Primary user account table.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'researcher',
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  sso_provider VARCHAR(50),
  sso_id VARCHAR(255),
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP WITH TIME ZONE,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_role CHECK (role IN ('admin', 'reviewer', 'researcher'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique email address |
| password_hash | VARCHAR(255) | bcrypt hashed password |
| full_name | VARCHAR(255) | Display name |
| role | VARCHAR(50) | admin, reviewer, or researcher |
| is_active | BOOLEAN | Account active status |
| email_verified | BOOLEAN | Email verification status |
| sso_provider | VARCHAR(50) | SSO provider name (future) |
| sso_id | VARCHAR(255) | SSO user ID (future) |
| failed_login_attempts | INTEGER | Failed login counter |
| locked_until | TIMESTAMP | Account lockout expiry |
| password_reset_token | VARCHAR(255) | Reset token |
| password_reset_expires | TIMESTAMP | Reset token expiry |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

---

#### sessions
Active user sessions for JWT management.

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  refresh_token VARCHAR(255) UNIQUE NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(session_token);
CREATE INDEX idx_sessions_refresh ON sessions(refresh_token);
```

---

### Projects

#### projects
Research project management.

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  project_type VARCHAR(100),
  department VARCHAR(255),
  principal_investigator_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_project_status CHECK (status IN ('draft', 'active', 'completed', 'archived'))
);

CREATE INDEX idx_projects_pi ON projects(principal_investigator_id);
CREATE INDEX idx_projects_status ON projects(status);
```

---

#### project_collaborators
Project team member assignments.

```sql
CREATE TABLE project_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(project_id, user_id),
  CONSTRAINT valid_collab_role CHECK (role IN ('co_investigator', 'research_assistant', 'coordinator'))
);

CREATE INDEX idx_project_collabs_project ON project_collaborators(project_id);
CREATE INDEX idx_project_collabs_user ON project_collaborators(user_id);
```

---

### Templates

#### templates
Form template definitions with JSON schemas.

```sql
CREATE TABLE templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version VARCHAR(50) NOT NULL,
  original_file_path VARCHAR(500),
  original_file_name VARCHAR(255),
  schema JSONB NOT NULL DEFAULT '{"sections": [], "fields": [], "rules": []}',
  is_active BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_templates_active ON templates(is_active);
CREATE INDEX idx_templates_published ON templates(is_published);
CREATE INDEX idx_templates_schema ON templates USING GIN(schema);
```

**Schema JSONB Structure**:
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
      "type": "text|textarea|checkbox|radio|select|date",
      "label": "Field Label",
      "required": true,
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

---

### Forms

#### form_instances
Active form instances.

```sql
CREATE TABLE form_instances (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES templates(id),
  project_id UUID REFERENCES projects(id),
  owner_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(500) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  current_version_number INTEGER DEFAULT 1,
  completion_percentage INTEGER DEFAULT 0,
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_form_status CHECK (status IN ('draft', 'in_review', 'needs_changes', 'approved', 'locked')),
  CONSTRAINT valid_percentage CHECK (completion_percentage >= 0 AND completion_percentage <= 100)
);

CREATE INDEX idx_forms_template ON form_instances(template_id);
CREATE INDEX idx_forms_project ON form_instances(project_id);
CREATE INDEX idx_forms_owner ON form_instances(owner_id);
CREATE INDEX idx_forms_status ON form_instances(status);
```

---

#### form_data
Current working data for form instances.

```sql
CREATE TABLE form_data (
  id SERIAL PRIMARY KEY,
  form_instance_id INTEGER UNIQUE NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  data JSONB DEFAULT '{}',
  conditional_state JSONB DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_form_data_instance ON form_data(form_instance_id);
CREATE INDEX idx_form_data_content ON form_data USING GIN(data);
```

**Data JSONB Structure**:
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

---

#### form_versions
Immutable version snapshots.

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

CREATE INDEX idx_versions_form ON form_versions(form_instance_id);
CREATE INDEX idx_versions_number ON form_versions(form_instance_id, version_number);
```

---

#### field_changes
Field-level change audit trail.

```sql
CREATE TABLE field_changes (
  id SERIAL PRIMARY KEY,
  form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES form_versions(id),
  user_id UUID REFERENCES users(id),
  field_id VARCHAR(255) NOT NULL,
  field_label VARCHAR(500),
  old_value JSONB,
  new_value JSONB,
  session_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_field_changes_form ON field_changes(form_instance_id);
CREATE INDEX idx_field_changes_field ON field_changes(field_id);
CREATE INDEX idx_field_changes_user ON field_changes(user_id);
CREATE INDEX idx_field_changes_time ON field_changes(created_at);
```

---

### Review Workflow

#### review_stages
Configurable review stages.

```sql
CREATE TABLE review_stages (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sequence_order INTEGER NOT NULL,
  default_deadline_days INTEGER DEFAULT 7,
  requires_all_previous BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_review_stages_order ON review_stages(sequence_order);
```

**Default Stages**:
| Code | Name | Order |
|------|------|-------|
| initial | Initial Review | 1 |
| compliance | Compliance Review | 2 |
| scientific | Scientific Review | 3 |
| final | Final Approval | 4 |

---

#### form_reviews
Review assignments and status.

```sql
CREATE TABLE form_reviews (
  id SERIAL PRIMARY KEY,
  form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  review_stage_id INTEGER REFERENCES review_stages(id),
  reviewer_id UUID REFERENCES users(id),
  status VARCHAR(50) DEFAULT 'pending',
  deadline DATE,
  overall_comments TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_review_status CHECK (status IN ('pending', 'assigned', 'in_progress', 'approved', 'rejected', 'revision_required'))
);

CREATE INDEX idx_form_reviews_form ON form_reviews(form_instance_id);
CREATE INDEX idx_form_reviews_reviewer ON form_reviews(reviewer_id);
CREATE INDEX idx_form_reviews_status ON form_reviews(status);
```

---

#### review_actions
Review action history.

```sql
CREATE TABLE review_actions (
  id SERIAL PRIMARY KEY,
  form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES form_versions(id),
  performed_by_id UUID REFERENCES users(id),
  action_type VARCHAR(50) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_action_type CHECK (action_type IN ('submit_for_review', 'request_changes', 'approve', 'reject', 'return_to_draft'))
);

CREATE INDEX idx_review_actions_form ON review_actions(form_instance_id);
CREATE INDEX idx_review_actions_time ON review_actions(created_at);
```

---

### Collaboration

#### form_collaborators
Form-level access permissions.

```sql
CREATE TABLE form_collaborators (
  id SERIAL PRIMARY KEY,
  form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  section_assignments JSONB,
  added_by_id UUID REFERENCES users(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(form_instance_id, user_id),
  CONSTRAINT valid_form_collab_role CHECK (role IN ('editor', 'viewer', 'commenter'))
);
```

---

#### comment_threads
Discussion threads on forms.

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
```

---

#### comments
Individual comments in threads.

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

---

#### comment_mentions
@mentions in comments.

```sql
CREATE TABLE comment_mentions (
  id SERIAL PRIMARY KEY,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mentions_comment ON comment_mentions(comment_id);
CREATE INDEX idx_mentions_user ON comment_mentions(mentioned_user_id);
```

---

#### editing_locks
Concurrent edit prevention.

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

---

### Amendments

#### amendments
Post-approval change requests.

```sql
CREATE TABLE amendments (
  id SERIAL PRIMARY KEY,
  form_instance_id INTEGER NOT NULL REFERENCES form_instances(id) ON DELETE CASCADE,
  amendment_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  description TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE,
  submitted_by_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_id UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_amendment_status CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'))
);

CREATE INDEX idx_amendments_form ON amendments(form_instance_id);
CREATE INDEX idx_amendments_status ON amendments(status);
```

---

#### amendment_field_changes
Amendment field-level changes.

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

---

### Files

#### files
File attachments for projects and forms.

```sql
CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  form_instance_id INTEGER REFERENCES form_instances(id),
  uploaded_by_id UUID REFERENCES users(id),
  file_name VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  category VARCHAR(100),
  storage_path VARCHAR(500) NOT NULL,
  checksum VARCHAR(64),
  is_encrypted BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_file_category CHECK (category IN ('proposal', 'irb_document', 'consent_form', 'protocol', 'data', 'result', 'other'))
);

CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_form ON files(form_instance_id);
CREATE INDEX idx_files_uploader ON files(uploaded_by_id);
```

---

### Tasks & Notifications

#### task_definitions
Task definition templates for configurable project workflows. Defines the types of tasks that can be created for projects.

```sql
CREATE TABLE task_definitions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  task_type VARCHAR(50) NOT NULL,
  auto_submit BOOLEAN DEFAULT false,
  default_required BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_task_type CHECK (task_type IN ('document_upload', 'form_completion', 'approval_required'))
);

CREATE INDEX idx_task_definitions_active ON task_definitions(is_active);
CREATE INDEX idx_task_definitions_order ON task_definitions(display_order);
```

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| name | VARCHAR(100) | Unique task definition name |
| description | TEXT | Detailed description of the task |
| task_type | VARCHAR(50) | Type: document_upload, form_completion, approval_required |
| auto_submit | BOOLEAN | Whether task auto-submits when completed |
| default_required | BOOLEAN | Whether task is required by default |
| display_order | INTEGER | Order for display in UI |
| is_active | BOOLEAN | Whether definition is active |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

---

#### project_type_task_mappings
Maps task definitions to specific project types, allowing different project types to have different required tasks.

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

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| project_type | VARCHAR(100) | Project type (retrospective, prospective, clinical_trial, etc.) |
| task_definition_id | INTEGER | Foreign key to task_definitions |
| is_required | BOOLEAN | Whether task is required for this project type |
| display_order | INTEGER | Order for display in UI |
| created_at | TIMESTAMP | Creation timestamp |

---

#### tasks
Task management with workflow tracking and review support.

```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  form_instance_id INTEGER REFERENCES form_instances(id),
  assigned_to_id UUID,
  created_by_id UUID NOT NULL,
  task_definition_id INTEGER REFERENCES task_definitions(id),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  task_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  due_date DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_id UUID,
  reviewer_comments TEXT,
  revision_count INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_task_status CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected', 'revision_required', 'completed', 'blocked', 'cancelled')),
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_form ON tasks(form_instance_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to_id);
CREATE INDEX idx_tasks_created_by ON tasks(created_by_id);
CREATE INDEX idx_tasks_definition ON tasks(task_definition_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_reviewed_by ON tasks(reviewed_by_id);
```

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| project_id | UUID | Foreign key to projects |
| form_instance_id | INTEGER | Foreign key to form_instances |
| assigned_to_id | UUID | User assigned to complete the task |
| created_by_id | UUID | User who created the task |
| task_definition_id | INTEGER | Foreign key to task_definitions (optional) |
| title | VARCHAR(500) | Task title |
| description | TEXT | Detailed task description |
| task_type | VARCHAR(100) | Type: document_upload, form_completion, review, approval, general |
| status | VARCHAR(50) | Task status (see constraint for values) |
| priority | VARCHAR(20) | Priority level: low, medium, high, urgent |
| due_date | DATE | Task due date |
| completed_at | TIMESTAMP | When task was completed |
| submitted_at | TIMESTAMP | When task was submitted for review |
| reviewed_at | TIMESTAMP | When task was reviewed |
| reviewed_by_id | UUID | User who reviewed the task |
| reviewer_comments | TEXT | Reviewer feedback/comments |
| revision_count | INTEGER | Number of revision cycles |
| is_required | BOOLEAN | Whether task is required |
| created_at | TIMESTAMP | Creation timestamp |
| updated_at | TIMESTAMP | Last update timestamp |

**Task Status Flow**:
```
pending -> in_progress -> submitted -> approved/rejected/revision_required
                                      -> completed (final state)
                                      -> blocked/cancelled (terminal states)
```

---

#### notifications
User notifications.

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link VARCHAR(500),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_time ON notifications(created_at);
```

---

### Audit

#### audit_logs
HIPAA-compliant audit trail.

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255),
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  session_id VARCHAR(255),
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Append-only (no updates or deletes)
CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_time ON audit_logs(created_at);
CREATE INDEX idx_audit_details ON audit_logs USING GIN(details);
```

**Action Types**:
- `login`, `logout`, `failed_login`
- `create`, `read`, `update`, `delete`
- `download`, `upload`
- `approve`, `reject`, `submit`

---

## Indexes Summary

| Table | Indexes |
|-------|---------|
| users | email, role |
| sessions | user_id, session_token, refresh_token |
| projects | principal_investigator_id, status |
| templates | is_active, is_published, schema (GIN) |
| form_instances | template_id, project_id, owner_id, status |
| form_data | form_instance_id, data (GIN) |
| form_versions | form_instance_id, version_number |
| field_changes | form_instance_id, field_id, user_id, created_at |
| task_definitions | is_active, display_order |
| project_type_task_mappings | project_type, task_definition_id |
| tasks | project_id, form_instance_id, assigned_to_id, created_by_id, task_definition_id, status, due_date, reviewed_by_id |
| notifications | user_id, (user_id, is_read), created_at |
| audit_logs | user_id, action, resource, created_at, details (GIN) |

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

---

*Last Updated: January 15, 2026*
