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

*Last Updated: January 22, 2026*
