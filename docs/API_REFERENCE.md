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

## Pagination (Future)

For list endpoints:

**Query Parameters**:
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 20, max: 100)

**Response**:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

*Last Updated: January 14, 2026*
