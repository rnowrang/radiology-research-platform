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

## Gateway API Endpoints

### Authentication

#### POST /api/auth/register
Create a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "fullName": "John Doe"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "fullName": "John Doe",
      "role": "researcher",
      "createdAt": "2026-01-14T00:00:00Z"
    }
  }
}
```

**Errors**:
- 400: Validation error
- 409: Email already exists

---

#### POST /api/auth/login
Authenticate user and receive tokens.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**Response** (200 OK):
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

**Errors**:
- 401: Invalid credentials
- 423: Account locked

---

#### POST /api/auth/refresh
Refresh access token using refresh token.

**Request Body**:
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

**Errors**:
- 401: Invalid or expired refresh token

---

#### POST /api/auth/logout
Invalidate current session.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### GET /api/auth/me
Get current user profile.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "fullName": "John Doe",
    "role": "researcher",
    "createdAt": "2026-01-14T00:00:00Z"
  }
}
```

---

### Health Check

#### GET /api/health
Check gateway service health.

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-01-14T00:00:00Z",
    "service": "gateway"
  }
}
```

---

### Forms (Proxied to Forms Service)

#### GET /api/forms/templates
List all published templates.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "IRB Application - Standard",
      "description": "Standard IRB application...",
      "version": "1.0",
      "isActive": true,
      "isPublished": true,
      "createdAt": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

#### GET /api/forms/templates/:id
Get template details with schema.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "IRB Application - Standard",
    "schema": {
      "sections": [
        {
          "id": "section_1",
          "title": "Project Information",
          "fields": [...]
        }
      ]
    }
  }
}
```

---

#### GET /api/forms
List user's forms.

**Headers**: Authorization required

**Query Parameters**:
- `status` (optional): Filter by status
- `projectId` (optional): Filter by project

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "templateId": 1,
      "title": "My IRB Application",
      "status": "draft",
      "completionPercentage": 45,
      "currentVersionNumber": 1,
      "createdAt": "2026-01-14T00:00:00Z",
      "updatedAt": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/forms
Create a new form instance.

**Headers**: Authorization required

**Request Body**:
```json
{
  "templateId": 1,
  "title": "My IRB Application",
  "projectId": "uuid" // optional
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "templateId": 1,
    "title": "My IRB Application",
    "status": "draft",
    "completionPercentage": 0,
    "currentVersionNumber": 1
  }
}
```

---

#### GET /api/forms/:id
Get form instance with data.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "templateId": 1,
    "template": { ... },
    "title": "My IRB Application",
    "status": "draft",
    "data": {
      "data": {
        "field_1": "value",
        "field_2": true
      },
      "conditionalState": {
        "field_3": true
      }
    }
  }
}
```

---

#### POST /api/forms/:id/data
Update form data (autosave).

**Headers**: Authorization required

**Request Body**:
```json
{
  "data": {
    "field_1": "updated value",
    "field_2": false
  },
  "conditionalState": {
    "field_3": false
  }
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "updatedAt": "2026-01-14T00:00:00Z",
    "completionPercentage": 50
  }
}
```

---

#### DELETE /api/forms/:id
Delete a form instance.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Form deleted successfully"
}
```

---

#### GET /api/forms/:id/versions
List form versions.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "versionNumber": 1,
      "versionLabel": "Initial submission",
      "statusAtCreation": "draft",
      "createdAt": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/forms/:id/versions
Create a new version snapshot.

**Headers**: Authorization required

**Request Body**:
```json
{
  "label": "Version 2",
  "summary": "Updated personnel section"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 2,
    "versionNumber": 2,
    "versionLabel": "Version 2"
  }
}
```

---

#### POST /api/forms/:id/export
Generate DOCX and PDF documents.

**Headers**: Authorization required

**Request Body**:
```json
{
  "versionId": 2 // optional, defaults to latest
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "docxPath": "/storage/generated/form_1_v2.docx",
    "pdfPath": "/storage/generated/form_1_v2.pdf"
  }
}
```

---

#### GET /api/forms/:id/download/:format
Download generated document.

**Headers**: Authorization required

**Path Parameters**:
- `format`: `docx` or `pdf`

**Query Parameters**:
- `versionId` (optional): Specific version

**Response**: Binary file download

---

#### POST /api/forms/:id/submit
Submit form for review.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "status": "in_review",
    "submittedAt": "2026-01-14T00:00:00Z"
  }
}
```

---

## Forms Service Direct API

The Forms Service API is typically accessed through the Gateway. Direct access is available for development.

### Templates

#### GET /api/templates
List all templates.

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "name": "IRB Application - Standard",
    "description": "...",
    "version": "1.0",
    "original_file_name": "irb-standard.docx",
    "schema": { ... },
    "is_active": true,
    "is_published": true,
    "created_at": "2026-01-14T00:00:00Z",
    "updated_at": "2026-01-14T00:00:00Z"
  }
]
```

---

#### GET /api/templates/{id}
Get template by ID.

**Response** (200 OK):
```json
{
  "id": 1,
  "name": "IRB Application - Standard",
  "schema": {
    "sections": [...],
    "fields": [...],
    "rules": [...]
  }
}
```

---

### Forms

#### GET /api/forms
List all forms.

**Query Parameters**:
- `owner_id`: Filter by owner
- `status`: Filter by status
- `project_id`: Filter by project

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "template_id": 1,
    "owner_id": "uuid",
    "title": "My Form",
    "status": "draft",
    "completion_percentage": 50,
    "current_version_number": 1,
    "created_at": "2026-01-14T00:00:00Z"
  }
]
```

---

#### POST /api/forms
Create form instance.

**Request Body**:
```json
{
  "template_id": 1,
  "owner_id": "uuid",
  "title": "My Form",
  "project_id": "uuid"
}
```

**Response** (201 Created):
```json
{
  "id": 1,
  "template_id": 1,
  "title": "My Form",
  "status": "draft"
}
```

---

#### GET /api/forms/{id}
Get form with data.

**Response** (200 OK):
```json
{
  "id": 1,
  "template_id": 1,
  "template": { ... },
  "title": "My Form",
  "status": "draft",
  "data": {
    "data": { ... },
    "conditional_state": { ... }
  }
}
```

---

#### POST /api/forms/{id}/data
Update form data.

**Request Body**:
```json
{
  "data": { ... },
  "conditional_state": { ... },
  "user_id": "uuid"
}
```

**Response** (200 OK):
```json
{
  "updated_at": "2026-01-14T00:00:00Z",
  "completion_percentage": 75
}
```

---

### Versions

#### GET /api/forms/{id}/versions
List versions.

**Response** (200 OK):
```json
[
  {
    "id": 1,
    "form_instance_id": 1,
    "version_number": 1,
    "version_label": "Initial",
    "data_snapshot": { ... },
    "status_at_creation": "draft",
    "created_at": "2026-01-14T00:00:00Z"
  }
]
```

---

#### POST /api/forms/{id}/versions
Create version.

**Request Body**:
```json
{
  "label": "Version 2",
  "summary": "Changes made",
  "user_id": "uuid"
}
```

**Response** (201 Created):
```json
{
  "id": 2,
  "version_number": 2,
  "version_label": "Version 2"
}
```

---

### Export

#### POST /api/export/form/{id}/generate
Generate documents.

**Request Body**:
```json
{
  "version_id": 2
}
```

**Response** (200 OK):
```json
{
  "docx_path": "/storage/generated/...",
  "pdf_path": "/storage/generated/..."
}
```

---

#### GET /api/export/form/{id}/download/{format}
Download document.

**Path Parameters**:
- `format`: `docx` or `pdf`

**Query Parameters**:
- `version_id`: Optional version

**Response**: Binary file

---

### Health

#### GET /api/health
Health check.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2026-01-14T00:00:00Z"
}
```

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
| CONFLICT | 409 | Resource already exists |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| /api/auth/* | 10 | 1 minute |
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

**Query Parameters**:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response**:
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

## Task Workflow System

The task workflow system provides a structured approach to managing project tasks with review, approval, and revision capabilities.

### Task Definitions (Admin)

#### GET /api/admin/task-definitions
List all task definitions.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "IRB Application",
      "description": "Complete and submit IRB application form",
      "task_type": "form_completion",
      "auto_submit": false,
      "default_required": true,
      "display_order": 1,
      "is_active": true,
      "created_at": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/admin/task-definitions
Create a new task definition.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "name": "Document Upload",
  "description": "Upload required supporting documents",
  "task_type": "document_upload",
  "auto_submit": false,
  "default_required": true,
  "display_order": 2,
  "is_active": true
}
```

**Task Types**:
- `document_upload`: Task requires file uploads
- `form_completion`: Task requires completing a form
- `approval_required`: Task requires approval from reviewer

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Document Upload",
    "task_type": "document_upload",
    "is_active": true
  }
}
```

---

#### PUT /api/admin/task-definitions/:id
Update an existing task definition.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "name": "Updated Task Name",
  "description": "Updated description",
  "display_order": 3,
  "is_active": true
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 2,
    "name": "Updated Task Name",
    "updated_at": "2026-01-14T00:00:00Z"
  }
}
```

---

#### DELETE /api/admin/task-definitions/:id
Deactivate a task definition (soft delete).

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Task definition deactivated successfully"
}
```

---

### Project Type Mappings (Admin)

#### GET /api/admin/project-type-mappings
List all project type to task definition mappings.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_type": "clinical_trial",
      "task_definition_id": 1,
      "task_definition_name": "IRB Application",
      "is_required": true,
      "display_order": 1
    }
  ]
}
```

---

#### GET /api/admin/project-type-mappings/:projectType
Get mappings for a specific project type.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_type": "clinical_trial",
      "task_definition_id": 1,
      "is_required": true,
      "display_order": 1
    }
  ]
}
```

---

#### POST /api/admin/project-type-mappings
Create a new project type to task mapping.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "project_type": "clinical_trial",
  "task_definition_id": 1,
  "is_required": true,
  "display_order": 1
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "project_type": "clinical_trial",
    "task_definition_id": 1
  }
}
```

---

#### DELETE /api/admin/project-type-mappings/:id
Delete a project type mapping.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Mapping deleted successfully"
}
```

---

### Tasks

#### GET /api/tasks
List all tasks for the current user.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "project_id": "uuid",
      "task_definition_id": 1,
      "name": "IRB Application",
      "status": "pending",
      "is_required": true,
      "assigned_to_id": "uuid",
      "due_date": "2026-02-01T00:00:00Z",
      "created_at": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/tasks
Create a new task.

**Headers**: Authorization required

**Request Body**:
```json
{
  "project_id": "uuid",
  "task_definition_id": 1,
  "name": "Custom Task",
  "assigned_to_id": "uuid",
  "due_date": "2026-02-01T00:00:00Z"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Custom Task",
    "status": "pending"
  }
}
```

---

#### GET /api/tasks/:id
Get task details.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "project_id": "uuid",
    "name": "IRB Application",
    "status": "in_progress",
    "assigned_to": {
      "id": "uuid",
      "name": "John Doe"
    }
  }
}
```

---

#### PUT /api/tasks/:id
Update a task.

**Headers**: Authorization required

**Request Body**:
```json
{
  "name": "Updated Task Name",
  "status": "in_progress",
  "due_date": "2026-02-15T00:00:00Z"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Updated Task Name",
    "updated_at": "2026-01-14T00:00:00Z"
  }
}
```

---

#### DELETE /api/tasks/:id
Delete a task.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Task deleted successfully"
}
```

---

#### POST /api/tasks/:id/complete
Mark a task as completed.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "completed",
    "completed_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### Task Workflow Actions

#### POST /api/tasks/:taskId/submit
Submit a task for review.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "submitted",
    "submitted_at": "2026-01-14T00:00:00Z"
  }
}
```

---

#### POST /api/tasks/:taskId/approve
Approve a submitted task.

**Headers**: Authorization required (Admin or Reviewer role)

**Request Body**:
```json
{
  "comments": "Approved. All requirements met."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "approved",
    "approved_at": "2026-01-14T00:00:00Z",
    "approved_by_id": "uuid"
  }
}
```

---

#### POST /api/tasks/:taskId/reject
Reject a submitted task.

**Headers**: Authorization required (Admin or Reviewer role)

**Request Body**:
```json
{
  "comments": "Missing required documentation. Please resubmit."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "rejected",
    "rejected_at": "2026-01-14T00:00:00Z"
  }
}
```

---

#### POST /api/tasks/:taskId/request-revision
Request revision on a submitted task.

**Headers**: Authorization required (Admin or Reviewer role)

**Request Body**:
```json
{
  "comments": "Please update section 3 with more detail."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "revision_required"
  }
}
```

---

#### GET /api/tasks/pending-review
Get all tasks awaiting review.

**Headers**: Authorization required (Admin or Reviewer role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "IRB Application",
      "status": "submitted",
      "submitted_at": "2026-01-14T00:00:00Z",
      "project": {
        "id": "uuid",
        "title": "Research Project"
      },
      "submitter": {
        "id": "uuid",
        "name": "John Doe"
      }
    }
  ]
}
```

---

#### GET /api/projects/:projectId/tasks
Get all tasks for a specific project.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "IRB Application",
      "status": "completed",
      "is_required": true,
      "display_order": 1
    },
    {
      "id": 2,
      "name": "Document Upload",
      "status": "in_progress",
      "is_required": true,
      "display_order": 2
    }
  ]
}
```

---

#### GET /api/projects/:projectId/task-progress
Get task completion progress for a project.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "project_id": "uuid",
    "total_tasks": 5,
    "completed_tasks": 3,
    "required_tasks": 4,
    "required_completed": 2,
    "progress_percentage": 60,
    "tasks_by_status": {
      "pending": 1,
      "in_progress": 1,
      "completed": 3
    }
  }
}
```

---

## Notifications API

### GET /api/notifications
Get paginated list of notifications for the current user.

**Headers**: Authorization required

**Query Parameters**:
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "type": "task_assigned",
      "title": "New Task Assigned",
      "message": "You have been assigned a new task: IRB Application",
      "is_read": false,
      "link": "/projects/uuid/tasks/1",
      "created_at": "2026-01-14T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### GET /api/notifications/unread-count
Get the count of unread notifications (for badge display).

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "count": 5
  }
}
```

---

### POST /api/notifications/:id/read
Mark a single notification as read.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

---

### POST /api/notifications/read-all
Mark all notifications as read.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

### DELETE /api/notifications/:id
Delete a notification.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Notification deleted"
}
```

---

## File Management API

### POST /api/files
Upload a file.

**Headers**:
- Authorization required
- Content-Type: multipart/form-data

**Form Data**:
- `file` (required): The file to upload
- `project_id` (optional): Associate with a project
- `form_id` (optional): Associate with a form
- `category` (optional): File category

**File Categories**:
- `proposal`
- `irb_document`
- `consent_form`
- `protocol`
- `data`
- `result`
- `other`

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "original_file_name": "document.pdf",
    "file_size": 1024000,
    "mime_type": "application/pdf",
    "category": "protocol",
    "created_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### GET /api/files/:id
Download a file.

**Headers**: Authorization required

**Response**: Binary file download with appropriate Content-Type header

---

### GET /api/files/:id/metadata
Get file metadata without downloading.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "original_file_name": "document.pdf",
    "file_size": 1024000,
    "mime_type": "application/pdf",
    "category": "protocol",
    "uploaded_by": {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "project_id": "uuid",
    "form_instance_id": 1,
    "created_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### DELETE /api/files/:id
Soft delete a file.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "File deleted successfully"
}
```

---

### GET /api/projects/:projectId/files
List all files associated with a project.

**Headers**: Authorization required

**Query Parameters**:
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "original_file_name": "proposal.pdf",
      "file_size": 2048000,
      "mime_type": "application/pdf",
      "category": "proposal",
      "created_at": "2026-01-14T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

---

### GET /api/forms/:formId/files
List all files associated with a form.

**Headers**: Authorization required

**Query Parameters**:
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "original_file_name": "consent_form.pdf",
      "category": "consent_form",
      "created_at": "2026-01-14T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 2,
    "totalPages": 1
  }
}
```

---

## Global Search API

### GET /api/search
Full-text search with pagination across all resource types.

**Headers**: Authorization required

**Query Parameters**:
- `q` (required): Search query string
- `type` (optional): Filter by type - `all`, `projects`, `forms`, `users`, `files` (default: `all`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "project",
      "title": "Clinical Trial Research",
      "description": "Phase 2 clinical trial for...",
      "link": "/projects/uuid",
      "rank": 0.95,
      "created_at": "2026-01-14T00:00:00Z"
    },
    {
      "id": "1",
      "type": "form",
      "title": "IRB Application",
      "subtitle": "Draft",
      "link": "/forms/1",
      "rank": 0.85,
      "created_at": "2026-01-14T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

---

### GET /api/search/quick
Quick search for autocomplete suggestions.

**Headers**: Authorization required

**Query Parameters**:
- `q` (required): Search query (minimum 2 characters)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "uuid",
        "type": "project",
        "title": "Clinical Trial",
        "link": "/projects/uuid"
      }
    ],
    "forms": [
      {
        "id": "1",
        "type": "form",
        "title": "IRB Application",
        "link": "/forms/1"
      }
    ],
    "users": [],
    "files": []
  }
}
```

---

## Activity Feed API

### GET /api/activity
Get global activity feed (admin only).

**Headers**: Authorization required (Admin role)

**Query Parameters**:
- `page` (optional): Page number
- `limit` (optional): Items per page
- `action` (optional): Filter by action type
- `resource_type` (optional): Filter by resource type
- `start_date` (optional): Filter from date (ISO 8601)
- `end_date` (optional): Filter to date (ISO 8601)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "actor": {
        "id": "uuid",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "action": "create",
      "action_label": "Created",
      "description": "Created project 'Clinical Trial Research'",
      "resource_type": "project",
      "resource_type_label": "Project",
      "resource_id": "uuid",
      "resource_link": "/projects/uuid",
      "details": null,
      "timestamp": "2026-01-14T00:00:00Z",
      "source": "audit_log",
      "icon": "plus",
      "icon_color": "green"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

### GET /api/activity/me
Get current user's own activity.

**Headers**: Authorization required

**Query Parameters**: Same as global activity

**Response** (200 OK):
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

---

### GET /api/projects/:projectId/activity
Get activity feed for a specific project.

**Headers**: Authorization required

**Query Parameters**: Same as global activity

**Response** (200 OK):
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

---

### GET /api/forms/:formId/activity
Get activity feed for a specific form.

**Headers**: Authorization required

**Query Parameters**: Same as global activity

**Response** (200 OK):
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

---

### GET /api/admin/users/:userId/activity
Get activity feed for a specific user (admin only).

**Headers**: Authorization required (Admin role)

**Query Parameters**: Same as global activity

**Response** (200 OK):
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

---

## Editing Locks API

The editing locks system prevents concurrent editing conflicts by allowing users to acquire exclusive locks on forms or individual sections.

### GET /api/forms/:formId/lock
Check lock status for a form.

**Headers**: Authorization required

**Query Parameters**:
- `section_id` (optional): Check lock for a specific section

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "is_locked": true,
    "lock_id": 1,
    "locked_by_id": "uuid",
    "locked_by_name": "John Doe",
    "expires_at": "2026-01-14T00:05:00Z",
    "created_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### POST /api/forms/:formId/lock
Acquire a lock on a form.

**Headers**: Authorization required

**Request Body**:
```json
{
  "section_id": "section_1",
  "duration_minutes": 5
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "lock_id": 1,
  "expires_at": "2026-01-14T00:05:00Z"
}
```

**Response** (409 Conflict - Lock already held):
```json
{
  "success": false,
  "error": "Lock already held by another user",
  "locked_by_id": "uuid"
}
```

---

### DELETE /api/forms/:formId/lock
Release a lock on a form.

**Headers**: Authorization required

**Query Parameters**:
- `section_id` (optional): Release lock for a specific section

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Lock released"
}
```

---

### POST /api/forms/:formId/lock/extend
Extend an existing lock.

**Headers**: Authorization required

**Request Body**:
```json
{
  "section_id": "section_1",
  "duration_minutes": 5
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "lock_id": 1,
  "expires_at": "2026-01-14T00:10:00Z",
  "extended": true
}
```

---

### GET /api/forms/:formId/locks
Get all active locks for a form.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "form_id": 1,
    "locks": [
      {
        "is_locked": true,
        "lock_id": 1,
        "section_id": "section_1",
        "locked_by_id": "uuid",
        "locked_by_name": "John Doe",
        "expires_at": "2026-01-14T00:05:00Z"
      }
    ]
  }
}
```

---

### POST /api/forms/:formId/lock/force-release
Force release a lock (admin only or lock owner).

**Headers**: Authorization required

**Request Body**:
```json
{
  "section_id": "section_1"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Lock force released"
}
```

---

### Section-Level Lock Endpoints

#### GET /api/forms/:formId/sections/:sectionId/lock
Check lock status for a specific section.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "is_locked": false
  }
}
```

---

#### POST /api/forms/:formId/sections/:sectionId/lock
Acquire a lock on a specific section.

**Headers**: Authorization required

**Query Parameters**:
- `duration_minutes` (optional): Lock duration (default: 5)

**Response** (200 OK):
```json
{
  "success": true,
  "lock_id": 2,
  "expires_at": "2026-01-14T00:05:00Z"
}
```

---

#### DELETE /api/forms/:formId/sections/:sectionId/lock
Release a section lock.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Section lock released"
}
```

---

## Amendment System API

The amendment system allows tracking and managing changes to approved forms through a structured workflow.

### GET /api/forms/:formId/amendments
List all amendments for a form.

**Headers**: Authorization required

**Query Parameters**:
- `status` (optional): Filter by status - `draft`, `submitted`, `approved`, `rejected`, `withdrawn`

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "form_instance_id": 1,
      "amendment_type": "protocol_change",
      "status": "submitted",
      "description": "Updated study protocol based on interim results",
      "submitted_at": "2026-01-14T00:00:00Z",
      "submitted_by_id": "uuid",
      "created_at": "2026-01-13T00:00:00Z",
      "field_changes_count": 3
    }
  ]
}
```

---

### POST /api/forms/:formId/amendments
Create a new amendment.

**Headers**: Authorization required

**Request Body**:
```json
{
  "amendment_type": "protocol_change",
  "description": "Updated study protocol based on interim results"
}
```

**Amendment Types**:
- `protocol_change`
- `personnel_change`
- `funding_change`
- `site_change`
- `procedure_change`
- `consent_update`
- `other`

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "amendment_type": "protocol_change",
    "status": "draft",
    "created_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### GET /api/amendments/:amendmentId
Get amendment details with field changes.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "form_instance_id": 1,
    "amendment_type": "protocol_change",
    "status": "draft",
    "description": "Updated study protocol",
    "field_changes": [
      {
        "id": 1,
        "amendment_id": 1,
        "field_id": "study_duration",
        "field_label": "Study Duration",
        "old_value": "12 months",
        "new_value": "18 months",
        "justification": "Extended based on enrollment rate"
      }
    ],
    "created_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### PUT /api/amendments/:amendmentId
Update a draft amendment.

**Headers**: Authorization required

**Request Body**:
```json
{
  "amendment_type": "procedure_change",
  "description": "Updated description"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "updated_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### DELETE /api/amendments/:amendmentId
Delete a draft amendment.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Amendment deleted"
}
```

---

### POST /api/amendments/:amendmentId/changes
Add a field change to an amendment.

**Headers**: Authorization required

**Request Body**:
```json
{
  "field_id": "study_duration",
  "field_label": "Study Duration",
  "old_value": "12 months",
  "new_value": "18 months",
  "justification": "Extended based on enrollment rate"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "amendment_id": 1,
    "field_id": "study_duration"
  }
}
```

---

### PUT /api/amendments/:amendmentId/changes/:changeId
Update a field change.

**Headers**: Authorization required

**Request Body**:
```json
{
  "new_value": "24 months",
  "justification": "Further extended based on new data"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "updated_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### DELETE /api/amendments/:amendmentId/changes/:changeId
Remove a field change.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Field change removed"
}
```

---

### POST /api/amendments/:amendmentId/submit
Submit an amendment for review.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "submitted",
    "submitted_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### POST /api/amendments/:amendmentId/approve
Approve a submitted amendment.

**Headers**: Authorization required (Reviewer role)

**Request Body**:
```json
{
  "notes": "Amendment approved. Changes are acceptable."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "approved",
    "reviewed_at": "2026-01-14T00:00:00Z",
    "reviewed_by_id": "uuid"
  }
}
```

---

### POST /api/amendments/:amendmentId/reject
Reject a submitted amendment.

**Headers**: Authorization required (Reviewer role)

**Request Body**:
```json
{
  "notes": "Amendment rejected. Insufficient justification for changes."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "rejected",
    "review_notes": "Amendment rejected. Insufficient justification for changes."
  }
}
```

---

### POST /api/amendments/:amendmentId/withdraw
Withdraw a submitted amendment (owner only).

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "withdrawn"
  }
}
```

---

## Review Stages API

The review stages system enables multi-stage review workflows with configurable stages and reviewer assignments.

### Admin - Stage Management

#### GET /api/admin/review-stages
List all review stages.

**Headers**: Authorization required (Admin role)

**Query Parameters**:
- `active_only` (optional): Filter to active stages only (default: true)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "code": "initial_review",
      "name": "Initial Review",
      "description": "Initial screening by department",
      "sequence_order": 1,
      "default_deadline_days": 7,
      "requires_all_previous": true,
      "is_active": true,
      "created_at": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

#### POST /api/admin/review-stages
Create a new review stage.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "code": "irb_review",
  "name": "IRB Review",
  "description": "Full IRB committee review",
  "sequence_order": 2,
  "default_deadline_days": 14,
  "requires_all_previous": true,
  "is_active": true
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": 2,
    "code": "irb_review",
    "name": "IRB Review"
  }
}
```

---

#### GET /api/admin/review-stages/:stageId
Get a specific review stage.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "code": "initial_review",
    "name": "Initial Review",
    "description": "Initial screening by department",
    "sequence_order": 1,
    "default_deadline_days": 7,
    "requires_all_previous": true,
    "is_active": true
  }
}
```

---

#### PUT /api/admin/review-stages/:stageId
Update a review stage.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "name": "Updated Stage Name",
  "default_deadline_days": 10
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "updated_at": "2026-01-14T00:00:00Z"
  }
}
```

---

#### DELETE /api/admin/review-stages/:stageId
Deactivate a review stage.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Review stage deactivated"
}
```

---

#### POST /api/admin/review-stages/reorder
Reorder review stages.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "stage_ids": [2, 1, 3]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Stages reordered successfully"
}
```

---

### Form Review Progress

#### GET /api/review/forms/:formId/stages
Get review progress for a form.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "form_id": 1,
    "form_title": "IRB Application",
    "form_status": "in_review",
    "current_stage_id": 2,
    "current_stage_name": "IRB Review",
    "stages": [
      {
        "stage_id": 1,
        "stage_code": "initial_review",
        "stage_name": "Initial Review",
        "sequence_order": 1,
        "review_id": 1,
        "reviewer_id": "uuid",
        "reviewer_name": "Jane Smith",
        "status": "approved",
        "deadline": "2026-01-21T00:00:00Z",
        "started_at": "2026-01-14T00:00:00Z",
        "completed_at": "2026-01-15T00:00:00Z"
      },
      {
        "stage_id": 2,
        "stage_code": "irb_review",
        "stage_name": "IRB Review",
        "sequence_order": 2,
        "status": "in_progress",
        "reviewer_id": "uuid",
        "reviewer_name": "Dr. Johnson",
        "deadline": "2026-01-28T00:00:00Z",
        "started_at": "2026-01-15T00:00:00Z"
      }
    ],
    "completed_stages": 1,
    "total_stages": 3,
    "progress_percentage": 33
  }
}
```

---

#### POST /api/review/forms/:formId/stages/:stageId/assign
Assign a reviewer to a stage.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "reviewer_id": "uuid",
  "deadline": "2026-01-28T00:00:00Z"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "stage_id": 2,
    "reviewer_id": "uuid",
    "deadline": "2026-01-28T00:00:00Z"
  }
}
```

---

#### POST /api/review/forms/:formId/stages/:stageId/start
Start review for a stage.

**Headers**: Authorization required (Assigned reviewer)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "stage_id": 2,
    "status": "in_progress",
    "started_at": "2026-01-15T00:00:00Z"
  }
}
```

---

#### POST /api/review/forms/:formId/stages/:stageId/complete
Complete a stage review.

**Headers**: Authorization required (Assigned reviewer)

**Request Body**:
```json
{
  "status": "approved",
  "comments": "All requirements met. Approved for next stage."
}
```

**Status Options**:
- `approved`
- `rejected`
- `revision_required`

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "stage_id": 2,
    "status": "approved",
    "completed_at": "2026-01-16T00:00:00Z"
  }
}
```

---

#### POST /api/review/forms/:formId/advance
Advance form to the next review stage.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "reviewer_id": "uuid"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "previous_stage": "Initial Review",
    "current_stage": "IRB Review",
    "assigned_reviewer_id": "uuid"
  }
}
```

---

## Reports/Analytics API (Admin)

All reports endpoints require Admin role.

### GET /api/admin/reports/overview
Get overview metrics dashboard.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "metrics": {
      "totalUsers": 150,
      "activeUsers": 120,
      "totalProjects": 45,
      "activeProjects": 30,
      "totalForms": 200,
      "formsInReview": 25,
      "totalTasks": 500,
      "pendingTasks": 75
    },
    "generatedAt": "2026-01-14T00:00:00Z"
  }
}
```

---

### GET /api/admin/reports/projects-by-type
Get projects grouped by type.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    { "name": "Clinical Trial", "value": 15 },
    { "name": "Basic Research", "value": 20 },
    { "name": "Retrospective Study", "value": 10 }
  ]
}
```

---

### GET /api/admin/reports/projects-by-status
Get projects grouped by status.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    { "name": "Active", "value": 30 },
    { "name": "Pending Approval", "value": 10 },
    { "name": "Completed", "value": 5 }
  ]
}
```

---

### GET /api/admin/reports/forms-by-status
Get forms grouped by status.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    { "name": "Draft", "value": 50 },
    { "name": "In Review", "value": 25 },
    { "name": "Approved", "value": 100 },
    { "name": "Rejected", "value": 25 }
  ]
}
```

---

### GET /api/admin/reports/forms-by-template
Get forms grouped by template.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    { "name": "IRB Application - Standard", "value": 80 },
    { "name": "IRB Amendment", "value": 60 },
    { "name": "Continuing Review", "value": 40 }
  ]
}
```

---

### GET /api/admin/reports/tasks-by-status
Get tasks grouped by status.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    { "name": "Pending", "value": 75 },
    { "name": "In Progress", "value": 50 },
    { "name": "Completed", "value": 350 },
    { "name": "Submitted", "value": 25 }
  ]
}
```

---

### GET /api/admin/reports/tasks-by-priority
Get tasks grouped by priority.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    { "name": "High", "value": 30 },
    { "name": "Medium", "value": 150 },
    { "name": "Low", "value": 100 }
  ]
}
```

---

### GET /api/admin/reports/activity-trends
Get activity trends over time.

**Headers**: Authorization required (Admin role)

**Query Parameters**:
- `start_date` (optional): Start date (ISO 8601)
- `end_date` (optional): End date (ISO 8601)
- `interval` (optional): `day`, `week`, or `month` (default: `day`)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-01-01",
      "forms": 5,
      "reviews": 3,
      "logins": 25
    },
    {
      "date": "2026-01-02",
      "forms": 8,
      "reviews": 4,
      "logins": 30
    }
  ],
  "meta": {
    "startDate": "2026-01-01",
    "endDate": "2026-01-14",
    "interval": "day"
  }
}
```

---

### GET /api/admin/reports/top-researchers
Get top researchers by activity.

**Headers**: Authorization required (Admin role)

**Query Parameters**:
- `limit` (optional): Number of researchers to return (default: 10)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "userId": "uuid",
      "fullName": "Dr. Jane Smith",
      "email": "jane.smith@example.com",
      "formsCreated": 25,
      "formsApproved": 20,
      "projectsCount": 5
    }
  ]
}
```

---

### GET /api/admin/reports/department-stats
Get statistics by department.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "department": "Radiology",
      "projectsCount": 15,
      "formsCount": 45
    },
    {
      "department": "Oncology",
      "projectsCount": 10,
      "formsCount": 30
    }
  ]
}
```

---

### GET /api/admin/reports/review-metrics
Get review performance metrics.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "totalReviews": 500,
    "avgReviewTimeHours": 48.5,
    "approvalRate": 0.75,
    "rejectionRate": 0.10,
    "revisionRate": 0.15
  }
}
```

---

### GET /api/admin/reports/monthly-submissions
Get monthly form submission statistics.

**Headers**: Authorization required (Admin role)

**Query Parameters**:
- `months` (optional): Number of months to return (default: 12)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "month": "2025-12",
      "submitted": 30,
      "approved": 25,
      "rejected": 5
    },
    {
      "month": "2026-01",
      "submitted": 35,
      "approved": 20,
      "rejected": 3
    }
  ]
}
```

---

### GET /api/admin/reports/users-by-role
Get users grouped by role.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    { "name": "Researcher", "value": 100 },
    { "name": "Reviewer", "value": 30 },
    { "name": "Admin", "value": 10 }
  ]
}
```

---

## Email System API (Admin)

### GET /api/admin/email/config
Get current email configuration.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "host": "smtp.example.com",
    "port": 587,
    "secure": true,
    "from": "noreply@example.com",
    "configured": true
  }
}
```

---

### POST /api/admin/email/test
Send a test email.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "email": "test@example.com"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Test email sent successfully",
  "data": {
    "messageId": "abc123"
  }
}
```

---

### POST /api/admin/email/verify
Verify email server connection.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Email server connection verified",
  "data": {
    "connected": true
  }
}
```

---

## User Management API (Admin)

### GET /api/admin/users
List all users with pagination and filters.

**Headers**: Authorization required (Admin role)

**Query Parameters**:
- `page` (optional): Page number
- `limit` (optional): Items per page
- `role` (optional): Filter by role
- `is_active` (optional): Filter by active status
- `search` (optional): Search by name or email

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "role": "researcher",
      "is_active": true,
      "created_at": "2026-01-14T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

### GET /api/admin/users/:id
Get user details.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "role": "researcher",
    "is_active": true,
    "created_at": "2026-01-14T00:00:00Z",
    "last_login_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### POST /api/admin/users
Create a new user.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "email": "newuser@example.com",
  "password": "SecurePass123",
  "full_name": "New User",
  "role": "researcher",
  "is_active": true
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "newuser@example.com",
    "full_name": "New User",
    "role": "researcher"
  }
}
```

---

### PUT /api/admin/users/:id
Update a user.

**Headers**: Authorization required (Admin role)

**Request Body**:
```json
{
  "full_name": "Updated Name",
  "role": "reviewer",
  "is_active": true
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "updated_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### DELETE /api/admin/users/:id
Deactivate a user (soft delete).

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

---

### POST /api/admin/users/:id/reset-password
Reset a user's password.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Password reset email sent",
  "data": {
    "temporary_password": "TempPass123"
  }
}
```

---

### POST /api/admin/users/:id/unlock
Unlock a locked user account.

**Headers**: Authorization required (Admin role)

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Account unlocked successfully"
}
```

---

## Projects API

### GET /api/projects
List all projects for the current user.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Clinical Trial Research",
      "description": "Phase 2 clinical trial...",
      "project_type": "clinical_trial",
      "status": "active",
      "created_by_id": "uuid",
      "created_at": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

### POST /api/projects
Create a new project.

**Headers**: Authorization required

**Request Body**:
```json
{
  "title": "New Research Project",
  "description": "Project description",
  "project_type": "basic_research"
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "New Research Project",
    "status": "draft"
  }
}
```

---

### GET /api/projects/:id
Get project details.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Clinical Trial Research",
    "description": "Phase 2 clinical trial...",
    "project_type": "clinical_trial",
    "status": "active",
    "created_by": {
      "id": "uuid",
      "name": "John Doe"
    },
    "collaborators": [...],
    "created_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### PUT /api/projects/:id
Update a project.

**Headers**: Authorization required

**Request Body**:
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "status": "active"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "updated_at": "2026-01-14T00:00:00Z"
  }
}
```

---

### DELETE /api/projects/:id
Delete a project.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Project deleted successfully"
}
```

---

### GET /api/projects/:id/collaborators
Get project collaborators.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "user_name": "Jane Smith",
      "user_email": "jane@example.com",
      "role": "editor",
      "added_at": "2026-01-14T00:00:00Z"
    }
  ]
}
```

---

### POST /api/projects/:id/collaborators
Add a collaborator to a project.

**Headers**: Authorization required

**Request Body**:
```json
{
  "user_id": "uuid",
  "role": "editor"
}
```

**Collaborator Roles**:
- `viewer`: Read-only access
- `editor`: Can edit project and forms
- `admin`: Full access including collaborator management

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "role": "editor"
  }
}
```

---

### DELETE /api/projects/:id/collaborators/:userId
Remove a collaborator from a project.

**Headers**: Authorization required

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Collaborator removed"
}
```

---

*Last Updated: January 15, 2026*
