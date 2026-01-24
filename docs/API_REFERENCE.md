# API Reference

This document provides a comprehensive reference for all API endpoints in the Radiology Research Platform.

---

## Base URLs

| Environment | Gateway API | Forms Service API |
|-------------|-------------|-------------------|
| Development | http://localhost:3001/api | http://localhost:8001/api |
| Production | https://api.example.com/api | Internal only |

---

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <access_token>
```

---

## Gateway Service (Port 3001)

The Gateway Service is the main entry point for the application. It handles authentication, user management, and proxies requests to the Forms Service.

### Health Check

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/health` | Check gateway service health | No |

---

### Authentication (`/api/auth/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create a new user account | No |
| POST | `/api/auth/login` | Authenticate and receive tokens | No |
| POST | `/api/auth/refresh` | Refresh access token using refresh token | No |
| POST | `/api/auth/forgot-password` | Request password reset email | No |
| POST | `/api/auth/reset-password` | Reset password with token | No |
| GET | `/api/auth/me` | Get current user profile | Yes |
| POST | `/api/auth/logout` | Invalidate current session | Yes |
| POST | `/api/auth/change-password` | Change current user's password | Yes |

---

### Users - Admin (`/api/admin/users/*`)

All user management endpoints require Admin role.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/users` | List all users (paginated, filterable) | Admin |
| GET | `/api/admin/users/:id` | Get user details | Admin |
| POST | `/api/admin/users` | Create a new user | Admin |
| PUT | `/api/admin/users/:id` | Update a user | Admin |
| DELETE | `/api/admin/users/:id` | Deactivate user (soft delete) | Admin |
| POST | `/api/admin/users/:id/reset-password` | Reset user's password | Admin |
| POST | `/api/admin/users/:id/unlock` | Unlock a locked account | Admin |
| GET | `/api/admin/users/:id/activity` | Get user's activity feed | Admin |

---

### Projects (`/api/projects/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects` | List all projects user has access to | Yes |
| POST | `/api/projects` | Create a new project | Yes |
| GET | `/api/projects/:id` | Get project details | Yes |
| PUT | `/api/projects/:id` | Update a project | Yes |
| DELETE | `/api/projects/:id` | Delete a project | Yes |
| GET | `/api/projects/:id/collaborators` | Get project collaborators | Yes |
| POST | `/api/projects/:id/collaborators` | Add a collaborator | Yes |
| PUT | `/api/projects/:id/collaborators/:userId` | Update collaborator role | Yes |
| DELETE | `/api/projects/:id/collaborators/:userId` | Remove a collaborator | Yes |
| GET | `/api/projects/:projectId/files` | List project files | Yes |
| GET | `/api/projects/:id/activity` | Get project activity feed | Yes |
| GET | `/api/projects/:projectId/tasks` | Get all tasks for project | Yes |
| GET | `/api/projects/:projectId/task-progress` | Get task completion progress | Yes |
| POST | `/api/projects/:projectId/tasks` | Create a task for project | Admin |
| GET | `/api/projects/:projectId/review-summary` | Get project review summary | Admin |
| POST | `/api/projects/:id/submit-for-approval` | Submit project for approval | Yes |
| POST | `/api/projects/:id/approve` | Approve project | Admin |
| POST | `/api/projects/:id/reject` | Reject project | Admin |
| POST | `/api/projects/:id/request-changes` | Request changes on project | Admin |

---

### Project Types (`/api/project-types/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/project-types/:projectType/tasks` | Get task definitions for a project type | Yes |

---

### Tasks (`/api/tasks/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tasks` | List all tasks for current user | Yes |
| POST | `/api/tasks` | Create a new task | Yes |
| GET | `/api/tasks/:id` | Get task details | Yes |
| PUT | `/api/tasks/:id` | Update a task | Yes |
| DELETE | `/api/tasks/:id` | Delete a task | Yes |
| POST | `/api/tasks/:id/complete` | Mark task as completed | Yes |
| POST | `/api/tasks/:id/start` | Start a pending task | Yes |
| POST | `/api/tasks/:id/assign` | Assign/reassign task | Yes |
| POST | `/api/tasks/:id/reopen` | Reopen rejected/cancelled task | Yes |
| POST | `/api/tasks/:id/unblock` | Unblock a blocked task | Yes |
| POST | `/api/tasks/:taskId/submit` | Submit task for review | Yes |
| POST | `/api/tasks/:taskId/approve` | Approve a submitted task | Admin/Reviewer |
| POST | `/api/tasks/:taskId/reject` | Reject a submitted task | Admin/Reviewer |
| POST | `/api/tasks/:taskId/request-revision` | Request revision on task | Admin/Reviewer |
| POST | `/api/tasks/:taskId/create-form` | Create form for form_completion task | Yes |
| GET | `/api/tasks/pending-review` | Get tasks awaiting review | Admin/Reviewer |

---

### Files (`/api/files/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/files` | Upload a file (multipart/form-data) | Yes |
| GET | `/api/files/:id` | Download a file | Yes |
| GET | `/api/files/:id/metadata` | Get file metadata | Yes |
| GET | `/api/files/:id/preview` | Preview file (inline viewing) | Yes |
| DELETE | `/api/files/:id` | Soft delete a file | Yes |
| GET | `/api/files/task/:taskId` | Get files by task ID | Yes |

---

### Notifications (`/api/notifications/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/notifications` | Get user's notifications (paginated) | Yes |
| GET | `/api/notifications/unread-count` | Get unread count for badge | Yes |
| POST | `/api/notifications/:id/read` | Mark notification as read | Yes |
| POST | `/api/notifications/read-all` | Mark all notifications as read | Yes |
| DELETE | `/api/notifications/:id` | Delete a notification | Yes |

---

### Notification Preferences (`/api/users/me/notification-preferences/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users/me/notification-preferences` | Get all preferences | Yes |
| GET | `/api/users/me/notification-preferences/types` | Get available notification types | Yes |
| PUT | `/api/users/me/notification-preferences` | Update multiple preferences | Yes |
| PUT | `/api/users/me/notification-preferences/:type` | Update single preference | Yes |

---

### Search (`/api/search/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/search` | Full-text search with pagination | Yes |
| GET | `/api/search/quick` | Quick search for autocomplete | Yes |

**Query Parameters for `/api/search`:**
- `q` (required): Search query string
- `type` (optional): Filter by type - `all`, `projects`, `forms`, `users`, `files`
- `page`, `limit`: Pagination

---

### Activity (`/api/activity/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/activity` | Get global activity feed | Admin |
| GET | `/api/activity/me` | Get current user's activity | Yes |

---

### Admin - Task Definitions (`/api/admin/task-definitions/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/task-definitions` | List all task definitions | Admin |
| POST | `/api/admin/task-definitions` | Create a task definition | Admin |
| PUT | `/api/admin/task-definitions/:id` | Update a task definition | Admin |
| DELETE | `/api/admin/task-definitions/:id` | Deactivate a task definition | Admin |

---

### Admin - Project Type Mappings (`/api/admin/project-type-mappings/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/project-type-mappings` | List all mappings | Admin |
| GET | `/api/admin/project-type-mappings/:projectType` | Get mappings for project type | Admin |
| POST | `/api/admin/project-type-mappings` | Create a new mapping | Admin |
| DELETE | `/api/admin/project-type-mappings/:id` | Delete a mapping | Admin |

---

### Admin - Review Stages (`/api/admin/review-stages/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/review-stages` | List all review stages | Admin |
| POST | `/api/admin/review-stages` | Create a new review stage | Admin |
| GET | `/api/admin/review-stages/:stageId` | Get a specific review stage | Admin |
| PUT | `/api/admin/review-stages/:stageId` | Update a review stage | Admin |
| DELETE | `/api/admin/review-stages/:stageId` | Deactivate a review stage | Admin |
| POST | `/api/admin/review-stages/reorder` | Reorder review stages | Admin |

---

### Admin - Reports (`/api/admin/reports/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/reports/overview` | Get overview metrics | Admin |
| GET | `/api/admin/reports/projects-by-type` | Projects grouped by type | Admin |
| GET | `/api/admin/reports/projects-by-status` | Projects grouped by status | Admin |
| GET | `/api/admin/reports/forms-by-status` | Forms grouped by status | Admin |
| GET | `/api/admin/reports/forms-by-template` | Forms grouped by template | Admin |
| GET | `/api/admin/reports/tasks-by-status` | Tasks grouped by status | Admin |
| GET | `/api/admin/reports/tasks-by-priority` | Tasks grouped by priority | Admin |
| GET | `/api/admin/reports/activity-trends` | Activity trends over time | Admin |
| GET | `/api/admin/reports/top-researchers` | Top researchers by activity | Admin |
| GET | `/api/admin/reports/department-stats` | Statistics by department | Admin |
| GET | `/api/admin/reports/review-metrics` | Review performance metrics | Admin |
| GET | `/api/admin/reports/monthly-submissions` | Monthly form submissions | Admin |
| GET | `/api/admin/reports/users-by-role` | Users grouped by role | Admin |

---

### Admin - Email (`/api/admin/email/*`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/admin/email/config` | Get email configuration | Admin |
| POST | `/api/admin/email/test` | Send a test email | Admin |
| POST | `/api/admin/email/verify` | Verify email server connection | Admin |

---

### Templates (Proxied to Forms Service)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/templates` | List all templates | Yes |
| GET | `/api/templates/published` | List published templates only | Yes |
| GET | `/api/templates/:templateId` | Get template details with schema | Yes |

---

### Forms (Proxied to Forms Service)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/forms` | List user's forms | Yes |
| POST | `/api/forms` | Create a new form instance | Yes |
| GET | `/api/forms/:formId` | Get form with data and template | Yes |
| POST | `/api/forms/:formId/data` | Update form data (autosave) | Yes |
| GET | `/api/forms/:formId/versions` | List form versions | Yes |
| POST | `/api/forms/:formId/versions` | Create a version snapshot | Yes |
| GET | `/api/forms/:formId/files` | List files for a form | Yes |
| GET | `/api/forms/:formId/activity` | Get form activity feed | Yes |

---

### Form Review Workflow (Proxied)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/review/queue` | Get forms pending review | Admin/Reviewer |
| POST | `/api/forms/:formId/submit` | Submit form for review | Yes |
| POST | `/api/forms/:formId/request-changes` | Request changes on form | Admin/Reviewer |
| POST | `/api/forms/:formId/approve` | Approve a form | Admin/Reviewer |
| POST | `/api/forms/:formId/reject` | Reject a form | Admin/Reviewer |
| POST | `/api/forms/:formId/return-to-draft` | Return form to draft | Yes |
| GET | `/api/forms/:formId/review-history` | Get review history | Yes |

---

### Form Comments (Proxied)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/forms/:formId/comments` | Get comment threads | Yes |
| POST | `/api/forms/:formId/comments` | Create a new comment | Yes |
| POST | `/api/threads/:threadId/resolve` | Resolve a comment thread | Yes |
| POST | `/api/threads/:threadId/reopen` | Reopen a resolved thread | Yes |

---

### Form Export (Proxied)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/forms/:formId/generate` | Generate DOCX and PDF | Yes |
| GET | `/api/forms/:formId/docx` | Download DOCX | Yes |
| GET | `/api/forms/:formId/pdf` | Download PDF | Yes |

---

### Form Audit (Proxied)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/forms/:formId/audit` | Get form audit log | Yes |
| GET | `/api/forms/:formId/audit/field/:fieldId` | Get field change history | Yes |

---

### Form Editing Locks (Proxied)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/forms/:formId/lock` | Check lock status | Yes |
| POST | `/api/forms/:formId/lock` | Acquire a lock | Yes |
| DELETE | `/api/forms/:formId/lock` | Release a lock | Yes |
| POST | `/api/forms/:formId/lock/extend` | Extend a lock | Yes |
| GET | `/api/forms/:formId/locks` | Get all active locks | Yes |
| GET | `/api/forms/:formId/sections/:sectionId/lock` | Check section lock | Yes |
| POST | `/api/forms/:formId/sections/:sectionId/lock` | Acquire section lock | Yes |
| DELETE | `/api/forms/:formId/sections/:sectionId/lock` | Release section lock | Yes |

---

### Amendments (Proxied)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/forms/:formId/amendments` | List amendments for form | Yes |
| POST | `/api/forms/:formId/amendments` | Create an amendment | Yes |
| GET | `/api/amendments/:amendmentId` | Get amendment details | Yes |
| PUT | `/api/amendments/:amendmentId` | Update draft amendment | Yes |
| DELETE | `/api/amendments/:amendmentId` | Delete draft amendment | Yes |
| POST | `/api/amendments/:amendmentId/changes` | Add field change | Yes |
| PUT | `/api/amendments/:amendmentId/changes/:changeId` | Update field change | Yes |
| DELETE | `/api/amendments/:amendmentId/changes/:changeId` | Remove field change | Yes |
| POST | `/api/amendments/:amendmentId/submit` | Submit for review | Yes |
| POST | `/api/amendments/:amendmentId/approve` | Approve amendment | Reviewer |
| POST | `/api/amendments/:amendmentId/reject` | Reject amendment | Reviewer |
| POST | `/api/amendments/:amendmentId/withdraw` | Withdraw amendment | Yes |

---

### Review Stages (Proxied)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/review/forms/:formId/stages` | Get form review progress | Yes |
| POST | `/api/review/forms/:formId/stages/:stageId/assign` | Assign reviewer to stage | Admin |
| POST | `/api/review/forms/:formId/stages/:stageId/start` | Start stage review | Reviewer |
| POST | `/api/review/forms/:formId/stages/:stageId/complete` | Complete stage review | Reviewer |
| POST | `/api/review/forms/:formId/advance` | Advance to next stage | Admin |

---

## Protocol Assistant API (`/api/protocol-assistant/*`)

The Protocol Assistant is an AI-powered service that helps researchers create study protocols, generate required documents, and prefill IRB forms. All endpoints are proxied through the Gateway and require JWT authentication.

### Health Check

#### `GET /api/protocol-assistant/health`

Check Protocol Assistant service health.

**Authentication:** Required

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2026-01-23T10:00:00Z"
}
```

---

### Session Management

#### `POST /api/protocol-assistant/sessions`

Create a new Protocol Assistant session.

**Authentication:** Required

**Request Body:**
```json
{
  "project_id": "uuid",
  "study_type": "clinical_trial",
  "title": "My Research Study"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "project_id": "uuid",
    "user_id": "uuid",
    "status": "active",
    "study_type": "clinical_trial",
    "title": "My Research Study",
    "created_at": "2026-01-23T10:00:00Z",
    "updated_at": "2026-01-23T10:00:00Z"
  }
}
```

---

#### `GET /api/protocol-assistant/sessions/:sessionId`

Get session details.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "project_id": "uuid",
    "user_id": "uuid",
    "status": "active",
    "study_type": "clinical_trial",
    "title": "My Research Study",
    "protocol_data": { ... },
    "gap_analysis": { ... },
    "documents_generated": ["abstract", "consent"],
    "created_at": "2026-01-23T10:00:00Z",
    "updated_at": "2026-01-23T10:00:00Z"
  }
}
```

---

#### `PATCH /api/protocol-assistant/sessions/:sessionId`

Update session details.

**Authentication:** Required

**Request Body:**
```json
{
  "title": "Updated Study Title",
  "study_type": "observational"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "title": "Updated Study Title",
    "study_type": "observational",
    "updated_at": "2026-01-23T10:05:00Z"
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/close`

Close a session and mark it as complete.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "status": "closed",
    "closed_at": "2026-01-23T11:00:00Z"
  }
}
```

---

#### `GET /api/protocol-assistant/projects/:projectId/session`

Get or create a session for a specific project. If a session already exists for the project, it returns the existing session. Otherwise, it creates a new one.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "project_id": "uuid",
    "status": "active",
    "is_new": false,
    "created_at": "2026-01-23T10:00:00Z"
  }
}
```

---

### Chat

#### `POST /api/protocol-assistant/sessions/:sessionId/chat`

Send a message to the Protocol Assistant and receive a response.

**Authentication:** Required

**Request Body:**
```json
{
  "message": "I want to conduct a study on the effects of a new imaging technique for detecting early-stage lung cancer.",
  "context": {
    "current_section": "study_design"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message_id": "uuid",
    "role": "assistant",
    "content": "That sounds like an important research area. Let me help you develop your study protocol. First, can you tell me more about the specific imaging technique you'll be using?",
    "suggestions": [
      "Describe the imaging modality",
      "Define your target population",
      "Outline expected outcomes"
    ],
    "extracted_data": {
      "study_type": "diagnostic_imaging",
      "condition": "lung_cancer"
    },
    "timestamp": "2026-01-23T10:01:00Z"
  }
}
```

---

#### `GET /api/protocol-assistant/sessions/:sessionId/history`

Get the complete chat history for a session.

**Authentication:** Required

**Query Parameters:**
- `limit` (optional): Number of messages to return (default: 50)
- `offset` (optional): Offset for pagination (default: 0)

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "message_id": "uuid",
        "role": "user",
        "content": "I want to conduct a study...",
        "timestamp": "2026-01-23T10:00:00Z"
      },
      {
        "message_id": "uuid",
        "role": "assistant",
        "content": "That sounds like an important research area...",
        "timestamp": "2026-01-23T10:01:00Z"
      }
    ],
    "total": 2,
    "has_more": false
  }
}
```

---

#### `GET /api/protocol-assistant/sessions/:sessionId/stream`

Stream real-time responses using Server-Sent Events (SSE).

**Authentication:** Required

**Headers:**
```
Accept: text/event-stream
```

**Response (SSE stream):**
```
event: message
data: {"type": "token", "content": "That"}

event: message
data: {"type": "token", "content": " sounds"}

event: message
data: {"type": "token", "content": " like"}

event: message
data: {"type": "complete", "message_id": "uuid"}
```

---

### Documents

#### `POST /api/protocol-assistant/sessions/:sessionId/documents/upload`

Upload a document (e.g., existing protocol, literature) for the assistant to analyze.

**Authentication:** Required

**Content-Type:** `multipart/form-data`

**Form Fields:**
- `file`: The document file (PDF, DOCX, or TXT)
- `document_type`: Type of document (e.g., "existing_protocol", "literature", "irb_template")

**Response:**
```json
{
  "success": true,
  "data": {
    "document_id": "uuid",
    "filename": "existing_protocol.pdf",
    "document_type": "existing_protocol",
    "file_size": 245678,
    "mime_type": "application/pdf",
    "status": "processing",
    "uploaded_at": "2026-01-23T10:02:00Z"
  }
}
```

---

#### `GET /api/protocol-assistant/sessions/:sessionId/documents`

Get all documents uploaded to a session.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "documents": [
      {
        "document_id": "uuid",
        "filename": "existing_protocol.pdf",
        "document_type": "existing_protocol",
        "status": "processed",
        "extracted_sections": ["background", "methods", "endpoints"],
        "uploaded_at": "2026-01-23T10:02:00Z"
      }
    ]
  }
}
```

---

#### `GET /api/protocol-assistant/sessions/:sessionId/protocol`

Get the extracted/generated protocol data for the session.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "protocol": {
      "title": "A Study of Novel Imaging Technique for Lung Cancer Detection",
      "study_type": "diagnostic_imaging",
      "background": "...",
      "objectives": {
        "primary": "...",
        "secondary": ["...", "..."]
      },
      "study_design": "...",
      "population": {
        "inclusion_criteria": ["...", "..."],
        "exclusion_criteria": ["...", "..."],
        "sample_size": 100
      },
      "endpoints": {
        "primary": "...",
        "secondary": ["...", "..."]
      },
      "safety_considerations": "...",
      "statistical_analysis": "..."
    },
    "completeness": 75,
    "missing_sections": ["budget", "timeline"]
  }
}
```

---

### Gap Analysis

#### `GET /api/protocol-assistant/sessions/:sessionId/gaps`

Get questions for missing or incomplete protocol information.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "gaps": [
      {
        "gap_id": "uuid",
        "section": "study_design",
        "field": "randomization_method",
        "question": "What randomization method will be used for participant assignment?",
        "priority": "high",
        "suggestions": ["Simple randomization", "Block randomization", "Stratified randomization"],
        "required_for": ["protocol", "irb_application"]
      },
      {
        "gap_id": "uuid",
        "section": "safety",
        "field": "adverse_event_reporting",
        "question": "How will adverse events be monitored and reported?",
        "priority": "high",
        "suggestions": [],
        "required_for": ["protocol", "consent_form"]
      }
    ],
    "total_gaps": 5,
    "critical_gaps": 2,
    "completeness_score": 75
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/gaps/answers`

Submit answers to gap analysis questions.

**Authentication:** Required

**Request Body:**
```json
{
  "answers": [
    {
      "gap_id": "uuid",
      "answer": "We will use block randomization with block sizes of 4 and 6."
    },
    {
      "gap_id": "uuid",
      "answer": "Adverse events will be monitored weekly and reported within 24 hours for serious events."
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "processed_answers": 2,
    "remaining_gaps": 3,
    "updated_completeness_score": 85,
    "updated_sections": ["study_design", "safety"]
  }
}
```

---

### Document Generation

#### `POST /api/protocol-assistant/sessions/:sessionId/generate/abstract`

Generate a study abstract based on protocol data.

**Authentication:** Required

**Request Body:**
```json
{
  "format": "structured",
  "word_limit": 350
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document_id": "uuid",
    "document_type": "abstract",
    "content": {
      "background": "...",
      "objectives": "...",
      "methods": "...",
      "expected_results": "...",
      "conclusion": "..."
    },
    "word_count": 342,
    "generated_at": "2026-01-23T10:10:00Z"
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/generate/consent`

Generate an informed consent form.

**Authentication:** Required

**Request Body:**
```json
{
  "reading_level": "8th_grade",
  "language": "en",
  "include_hipaa": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document_id": "uuid",
    "document_type": "consent_form",
    "content": "...",
    "sections": [
      "introduction",
      "purpose",
      "procedures",
      "risks",
      "benefits",
      "alternatives",
      "confidentiality",
      "hipaa_authorization",
      "voluntary_participation",
      "contact_information",
      "signature_block"
    ],
    "reading_level_score": 7.8,
    "generated_at": "2026-01-23T10:12:00Z"
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/generate/protocol`

Generate a complete study protocol document.

**Authentication:** Required

**Request Body:**
```json
{
  "template": "irb_standard",
  "include_appendices": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document_id": "uuid",
    "document_type": "protocol",
    "content": "...",
    "sections": [
      "title_page",
      "synopsis",
      "background",
      "objectives",
      "study_design",
      "population",
      "procedures",
      "safety",
      "statistical_analysis",
      "ethics",
      "references",
      "appendices"
    ],
    "page_count": 25,
    "generated_at": "2026-01-23T10:15:00Z"
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/generate/recruitment`

Generate recruitment materials (flyers, scripts, ads).

**Authentication:** Required

**Request Body:**
```json
{
  "material_types": ["flyer", "phone_script", "email_template"],
  "target_audience": "general_public"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "materials": [
      {
        "document_id": "uuid",
        "material_type": "flyer",
        "content": "...",
        "format": "markdown"
      },
      {
        "document_id": "uuid",
        "material_type": "phone_script",
        "content": "...",
        "format": "text"
      },
      {
        "document_id": "uuid",
        "material_type": "email_template",
        "content": "...",
        "format": "html"
      }
    ],
    "generated_at": "2026-01-23T10:18:00Z"
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/generate/data-management`

Generate a Data Management Plan (DMP).

**Authentication:** Required

**Request Body:**
```json
{
  "funding_agency": "NIH",
  "data_types": ["imaging", "clinical", "biospecimen"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document_id": "uuid",
    "document_type": "data_management_plan",
    "content": "...",
    "sections": [
      "data_description",
      "data_standards",
      "data_sharing",
      "data_preservation",
      "roles_responsibilities",
      "budget"
    ],
    "compliant_with": ["NIH_DMS_Policy"],
    "generated_at": "2026-01-23T10:20:00Z"
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/generate`

Generate a specific document type.

**Authentication:** Required

**Request Body:**
```json
{
  "document_type": "investigator_brochure",
  "options": {
    "include_references": true,
    "format": "docx"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "document_id": "uuid",
    "document_type": "investigator_brochure",
    "content": "...",
    "format": "docx",
    "download_url": "/api/protocol-assistant/documents/uuid/download",
    "generated_at": "2026-01-23T10:22:00Z"
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/generate-all`

Generate all required documents for the study.

**Authentication:** Required

**Request Body:**
```json
{
  "document_types": ["protocol", "consent_form", "abstract", "data_management_plan"],
  "options": {
    "format": "pdf"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "job_id": "uuid",
    "status": "processing",
    "documents_requested": 4,
    "estimated_completion": "2026-01-23T10:30:00Z"
  }
}
```

---

### Form Prefill

#### `POST /api/protocol-assistant/sessions/:sessionId/prefill-form/:formId`

Prefill an existing form with data from the protocol session.

**Authentication:** Required

**Request Body:**
```json
{
  "overwrite_existing": false,
  "sections": ["project_info", "study_design", "population"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "form_id": "uuid",
    "fields_prefilled": 45,
    "fields_skipped": 5,
    "completion_percentage": 68,
    "prefilled_sections": ["project_info", "study_design", "population"],
    "mapping_details": [
      {
        "form_field": "study_title",
        "protocol_field": "title",
        "value": "A Study of Novel Imaging Technique...",
        "confidence": 1.0
      }
    ]
  }
}
```

---

#### `POST /api/protocol-assistant/sessions/:sessionId/create-prefilled-form`

Create a new form and prefill it with protocol data.

**Authentication:** Required

**Request Body:**
```json
{
  "template_id": "uuid",
  "project_id": "uuid",
  "form_title": "IRB Application - Lung Cancer Imaging Study"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "form_id": "uuid",
    "template_id": "uuid",
    "project_id": "uuid",
    "title": "IRB Application - Lung Cancer Imaging Study",
    "fields_prefilled": 52,
    "completion_percentage": 72,
    "status": "draft",
    "created_at": "2026-01-23T10:25:00Z"
  }
}
```

---

### Admin

#### `GET /api/protocol-assistant/admin/stats`

Get Protocol Assistant usage statistics.

**Authentication:** Required (Admin role)

**Query Parameters:**
- `start_date` (optional): Start date for statistics period (ISO 8601)
- `end_date` (optional): End date for statistics period (ISO 8601)
- `group_by` (optional): Grouping period - `day`, `week`, `month` (default: `day`)

**Response:**
```json
{
  "success": true,
  "data": {
    "period": {
      "start": "2026-01-01T00:00:00Z",
      "end": "2026-01-23T23:59:59Z"
    },
    "summary": {
      "total_sessions": 156,
      "active_sessions": 23,
      "completed_sessions": 98,
      "total_messages": 4521,
      "total_documents_generated": 312,
      "total_forms_prefilled": 87,
      "average_session_duration_minutes": 45,
      "average_messages_per_session": 29
    },
    "documents_by_type": {
      "protocol": 89,
      "consent_form": 76,
      "abstract": 65,
      "data_management_plan": 42,
      "recruitment": 40
    },
    "usage_by_day": [
      {
        "date": "2026-01-22",
        "sessions": 12,
        "messages": 342,
        "documents": 28
      }
    ],
    "top_users": [
      {
        "user_id": "uuid",
        "sessions": 15,
        "documents_generated": 23
      }
    ]
  }
}
```

---

### Utility

#### `GET /api/protocol-assistant/document-types`

Get list of supported document types that can be generated.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "document_types": [
      {
        "type": "protocol",
        "name": "Study Protocol",
        "description": "Complete research protocol document",
        "templates": ["irb_standard", "fda_ind", "nih_clinical_trial"]
      },
      {
        "type": "consent_form",
        "name": "Informed Consent Form",
        "description": "Participant consent document",
        "templates": ["adult", "pediatric", "short_form"]
      },
      {
        "type": "abstract",
        "name": "Study Abstract",
        "description": "Structured or unstructured study summary",
        "templates": ["structured", "narrative"]
      },
      {
        "type": "data_management_plan",
        "name": "Data Management Plan",
        "description": "DMP compliant with funding agency requirements",
        "templates": ["nih", "nsf", "generic"]
      },
      {
        "type": "recruitment",
        "name": "Recruitment Materials",
        "description": "Flyers, scripts, and advertisements",
        "templates": ["flyer", "phone_script", "email", "social_media"]
      },
      {
        "type": "investigator_brochure",
        "name": "Investigator Brochure",
        "description": "Comprehensive investigator reference document",
        "templates": ["standard"]
      }
    ]
  }
}
```

---

#### `GET /api/protocol-assistant/sessions/:sessionId/progress`

Get the overall progress of a Protocol Assistant session.

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "overall_progress": 72,
    "stages": {
      "protocol_extraction": {
        "status": "completed",
        "progress": 100
      },
      "gap_analysis": {
        "status": "in_progress",
        "progress": 60,
        "gaps_remaining": 3
      },
      "document_generation": {
        "status": "pending",
        "progress": 0,
        "documents_generated": 0,
        "documents_total": 4
      },
      "form_prefill": {
        "status": "pending",
        "progress": 0
      }
    },
    "next_recommended_action": "Answer remaining gap questions to improve document quality",
    "estimated_completion_minutes": 15
  }
}
```

---

## Forms Service (Port 8001)

The Forms Service handles all form-related operations. It is typically accessed through the Gateway, but direct access is available for development.

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Forms service health check |

---

### Templates (`/api/templates/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/templates` | List all templates |
| GET | `/api/templates/published` | List published templates only |
| GET | `/api/templates/{template_id}` | Get template by ID |
| POST | `/api/templates` | Create a new template |
| PUT | `/api/templates/{template_id}` | Update a template |
| POST | `/api/templates/{template_id}/publish` | Publish a template |
| POST | `/api/templates/{template_id}/unpublish` | Unpublish a template |

---

### Forms (`/api/forms/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forms` | List forms with filters |
| POST | `/api/forms` | Create a form instance |
| GET | `/api/forms/{form_id}` | Get form with data |
| PUT | `/api/forms/{form_id}` | Update form metadata |
| POST | `/api/forms/{form_id}/data` | Update form field data |
| DELETE | `/api/forms/{form_id}` | Delete a draft form |

**Query Parameters for GET `/api/forms`:**
- `owner_id`: Filter by owner
- `project_id`: Filter by project
- `status`: Filter by status
- `template_id`: Filter by template

---

### Versions (`/api/versions/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/versions/form/{form_id}` | List all versions of a form |
| GET | `/api/versions/{version_id}` | Get a specific version |
| POST | `/api/versions/form/{form_id}/create` | Create a new version snapshot |

---

### Export (`/api/export/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/export/form/{form_id}/generate` | Generate DOCX and PDF |
| GET | `/api/export/form/{form_id}/docx` | Download DOCX |
| GET | `/api/export/form/{form_id}/pdf` | Download PDF |

---

### Review (`/api/review/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review/queue` | Get forms pending review |
| POST | `/api/review/forms/{form_id}/submit` | Submit for review |
| POST | `/api/review/forms/{form_id}/request-changes` | Request changes |
| POST | `/api/review/forms/{form_id}/approve` | Approve form |
| POST | `/api/review/forms/{form_id}/reject` | Reject form |
| POST | `/api/review/forms/{form_id}/return-to-draft` | Return to draft |
| GET | `/api/review/forms/{form_id}/history` | Get review history |
| GET | `/api/review/forms/{form_id}/comments` | Get comment threads |
| GET | `/api/review/forms/{form_id}/mentionable-users` | Get users for @mentions |
| POST | `/api/review/forms/{form_id}/comments` | Create a comment |
| POST | `/api/review/threads/{thread_id}/reply` | Reply to thread |
| POST | `/api/review/threads/{thread_id}/resolve` | Resolve thread |
| POST | `/api/review/threads/{thread_id}/reopen` | Reopen thread |
| PUT | `/api/review/comments/{comment_id}` | Update a comment |
| DELETE | `/api/review/comments/{comment_id}` | Delete a comment |

---

### Review Stages (`/api/admin/review-stages/*` and `/api/review/*`)

**Admin Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/review-stages` | List all review stages |
| POST | `/api/admin/review-stages` | Create a review stage |
| GET | `/api/admin/review-stages/{stage_id}` | Get a review stage |
| PUT | `/api/admin/review-stages/{stage_id}` | Update a review stage |
| DELETE | `/api/admin/review-stages/{stage_id}` | Deactivate a review stage |
| POST | `/api/admin/review-stages/reorder` | Reorder stages |

**Form Review Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review/forms/{form_id}/stages` | Get form review progress |
| POST | `/api/review/forms/{form_id}/stages/{stage_id}/assign` | Assign reviewer |
| POST | `/api/review/forms/{form_id}/stages/{stage_id}/start` | Start stage review |
| POST | `/api/review/forms/{form_id}/stages/{stage_id}/complete` | Complete stage |
| POST | `/api/review/forms/{form_id}/advance` | Advance to next stage |

---

### Projects (`/api/projects/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/{project_id}` | Get project details |
| PUT | `/api/projects/{project_id}` | Update a project |
| DELETE | `/api/projects/{project_id}` | Delete a project |
| GET | `/api/projects/{project_id}/collaborators` | List collaborators |
| POST | `/api/projects/{project_id}/collaborators` | Add collaborator |
| DELETE | `/api/projects/{project_id}/collaborators/{collaborator_id}` | Remove collaborator |
| GET | `/api/projects/{project_id}/forms` | List project forms |
| GET | `/api/projects/{project_id}/tasks` | List project tasks |
| POST | `/api/projects/{project_id}/tasks` | Create project task |
| GET | `/api/projects/{project_id}/task-progress` | Get task progress |
| POST | `/api/projects/{project_id}/submit-for-approval` | Submit for approval |
| POST | `/api/projects/{project_id}/approve` | Approve project |
| POST | `/api/projects/{project_id}/reject` | Reject project |
| POST | `/api/projects/{project_id}/request-changes` | Request changes |

---

### Tasks (`/api/tasks/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks with filters |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks/{task_id}` | Get task details |
| PUT | `/api/tasks/{task_id}` | Update a task |
| DELETE | `/api/tasks/{task_id}` | Delete a task |
| POST | `/api/tasks/{task_id}/complete` | Mark as completed |
| POST | `/api/tasks/{task_id}/start` | Start a pending task |
| POST | `/api/tasks/{task_id}/assign` | Assign task |
| POST | `/api/tasks/{task_id}/reopen` | Reopen task |
| POST | `/api/tasks/{task_id}/unblock` | Unblock task |
| POST | `/api/tasks/{task_id}/submit` | Submit for review |
| POST | `/api/tasks/{task_id}/approve` | Approve task |
| POST | `/api/tasks/{task_id}/reject` | Reject task |
| POST | `/api/tasks/{task_id}/request-revision` | Request revision |
| POST | `/api/tasks/{task_id}/create-form` | Create form for task |
| POST | `/api/tasks/{task_id}/mark-complete` | Mark upload task complete |
| GET | `/api/tasks/pending-review/list` | List tasks pending review |
| POST | `/api/tasks/auto-complete-upload` | Auto-complete upload task |
| POST | `/api/tasks/sync-from-form` | Sync task status from form |

---

### Task Definitions (`/api/task-definitions/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/task-definitions` | List task definitions |
| POST | `/api/task-definitions` | Create task definition |
| GET | `/api/task-definitions/{definition_id}` | Get task definition |
| PUT | `/api/task-definitions/{definition_id}` | Update task definition |
| DELETE | `/api/task-definitions/{definition_id}` | Deactivate task definition |
| GET | `/api/task-definitions/mappings/all` | List all project type mappings |
| GET | `/api/task-definitions/mappings/{project_type}` | Get mappings for project type |
| POST | `/api/task-definitions/mappings` | Create project type mapping |
| DELETE | `/api/task-definitions/mappings/{mapping_id}` | Delete mapping |
| GET | `/api/task-definitions/project-types/available` | List project types with mappings |
| GET | `/api/task-definitions/project-types/{project_type}/tasks` | Preview tasks for project type |

---

### Editing Locks (`/api/forms/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/forms/{form_id}/lock` | Acquire a lock |
| DELETE | `/api/forms/{form_id}/lock` | Release a lock |
| GET | `/api/forms/{form_id}/lock` | Check lock status |
| GET | `/api/forms/{form_id}/locks` | Get all active locks |
| POST | `/api/forms/{form_id}/lock/extend` | Extend a lock |
| POST | `/api/forms/{form_id}/lock/force-release` | Force release (admin) |
| POST | `/api/forms/{form_id}/sections/{section_id}/lock` | Acquire section lock |
| DELETE | `/api/forms/{form_id}/sections/{section_id}/lock` | Release section lock |
| GET | `/api/forms/{form_id}/sections/{section_id}/lock` | Check section lock |

---

### Amendments (`/api/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/forms/{form_id}/amendments` | List form amendments |
| POST | `/api/forms/{form_id}/amendments` | Create amendment |
| GET | `/api/amendments/{amendment_id}` | Get amendment details |
| PUT | `/api/amendments/{amendment_id}` | Update amendment |
| DELETE | `/api/amendments/{amendment_id}` | Delete amendment |
| POST | `/api/amendments/{amendment_id}/changes` | Add field change |
| PUT | `/api/amendments/{amendment_id}/changes/{change_id}` | Update field change |
| DELETE | `/api/amendments/{amendment_id}/changes/{change_id}` | Remove field change |
| POST | `/api/amendments/{amendment_id}/submit` | Submit amendment |
| POST | `/api/amendments/{amendment_id}/approve` | Approve amendment |
| POST | `/api/amendments/{amendment_id}/reject` | Reject amendment |
| POST | `/api/amendments/{amendment_id}/withdraw` | Withdraw amendment |

---

### Audit (`/api/audit/*`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/audit/form/{form_id}` | Get form audit log |
| GET | `/api/audit/form/{form_id}/field/{field_id}` | Get field change history |

---

## Error Response Format

All errors follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { ... }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid request data |
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| CONFLICT | 409 | Resource already exists or lock conflict |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/auth/* | 10 | 1 minute |
| /api/auth/forgot-password | 5 | 1 minute |
| /api/* | 100 | 15 minutes |
| /api/export/* | 20 | 15 minutes |

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1234567890
```

---

## Pagination

For list endpoints:

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## Common Request/Response Examples

### Authentication - Login

**Request:**
```json
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "John Doe",
      "role": "researcher"
    },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

### Create Form

**Request:**
```json
POST /api/forms
{
  "template_id": 1,
  "title": "My IRB Application",
  "project_id": "uuid"
}
```

**Response:**
```json
{
  "id": 1,
  "template_id": 1,
  "title": "My IRB Application",
  "status": "draft",
  "completion_percentage": 0,
  "current_version_number": 1
}
```

### Update Form Data

**Request:**
```json
POST /api/forms/:formId/data
{
  "changes": [
    {
      "field_id": "study_title",
      "field_label": "Study Title",
      "old_value": null,
      "new_value": "My Research Study"
    }
  ],
  "section_id": "project_info",
  "user_id": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": { ... },
  "completion_percentage": 15
}
```

### Submit Form for Review

**Request:**
```json
POST /api/forms/:formId/submit
{
  "notes": "Ready for review"
}
```

**Response:**
```json
{
  "id": 1,
  "form_instance_id": 1,
  "action_type": "submit_for_review",
  "performed_by_id": "uuid",
  "created_at": "2026-01-14T00:00:00Z"
}
```

---

*Last Updated: January 23, 2026*
