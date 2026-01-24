# Protocol Assistant API Reference

This document provides comprehensive API documentation for the Protocol Assistant service. All endpoints require authentication unless otherwise noted.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Sessions API](#sessions-api)
- [Documents API](#documents-api)
- [Generation API](#generation-api)
- [Admin API](#admin-api)
- [Integration API](#integration-api)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)

## Overview

### Base URL

```
Production: https://api.your-domain.com/api/v1/assistant
Development: http://localhost:8000/api/v1/assistant
```

### Content Type

All requests and responses use JSON:
```
Content-Type: application/json
Accept: application/json
```

### Request Format

```http
POST /api/v1/assistant/sessions HTTP/1.1
Host: api.your-domain.com
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "protocol_type": "human_subjects",
  "title": "My Research Protocol"
}
```

### Response Format

All responses follow a standard format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { ... }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

## Authentication

The Protocol Assistant uses JWT (JSON Web Token) authentication.

### Obtain Access Token

```http
POST /api/v1/auth/login
```

**Request:**
```json
{
  "email": "researcher@institution.edu",
  "password": "secure_password"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
      "id": "usr_123",
      "email": "researcher@institution.edu",
      "name": "Dr. Jane Smith",
      "roles": ["researcher"],
      "institution_id": "inst_456"
    }
  }
}
```

### Refresh Token

```http
POST /api/v1/auth/refresh
```

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 3600
  }
}
```

### Using Access Token

Include the token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Sessions API

Sessions represent ongoing protocol creation conversations. Each session maintains context, history, extracted protocol data, and identified gaps for the AI assistant.

### Create Session

Creates a new chat session for a project.

```http
POST /api/protocol-assistant/sessions
```

**Request:**
```json
{
  "project_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:** `201 Created`
```json
{
  "session_id": "660e8400-e29b-41d4-a716-446655440001",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "has_extracted_protocol": false,
  "completion_percentage": 0,
  "title": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": null
}
```

### Get Session

Retrieves details of a specific chat session.

```http
GET /api/protocol-assistant/sessions/{session_id}
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Response:** `200 OK`
```json
{
  "session_id": "660e8400-e29b-41d4-a716-446655440001",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "has_extracted_protocol": true,
  "completion_percentage": 65,
  "title": "Phase 2 Clinical Trial Protocol",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T11:45:00Z"
}
```

**Error Responses:**
- `404 Not Found`: Session does not exist

### Get or Create Session for Project

Gets an existing active session for a project or creates a new one.

```http
GET /api/protocol-assistant/projects/{project_id}/session
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `project_id` | uuid | The project UUID |

**Response:** `200 OK`
```json
{
  "session_id": "660e8400-e29b-41d4-a716-446655440001",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "has_extracted_protocol": false,
  "completion_percentage": 0,
  "title": null,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": null
}
```

### Update Session

Updates session data including extracted protocol, gaps, and status.

```http
PATCH /api/protocol-assistant/sessions/{session_id}
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Request:**
```json
{
  "extracted_protocol": {
    "title": "Study Title",
    "principal_investigator": "Dr. Smith",
    "study_type": "interventional"
  },
  "current_gaps": [
    {
      "id": "gap_1",
      "question": "What is the sample size justification?",
      "priority": "high"
    }
  ],
  "collected_answers": {
    "sample_size": "Based on power analysis..."
  },
  "status": "active",
  "completion_percentage": 75,
  "title": "Updated Protocol Title"
}
```

All fields are optional. Only provided fields will be updated.

**Response:** `200 OK`
```json
{
  "session_id": "660e8400-e29b-41d4-a716-446655440001",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "active",
  "has_extracted_protocol": true,
  "completion_percentage": 75,
  "title": "Updated Protocol Title",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T12:00:00Z"
}
```

### Close Session

Marks a session as completed.

```http
POST /api/protocol-assistant/sessions/{session_id}/close
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Response:** `200 OK`
```json
{
  "status": "success",
  "message": "Session {session_id} has been closed"
}
```

**Error Responses:**
- `404 Not Found`: Session does not exist
- `400 Bad Request`: Session is already closed

---

## Chat API

### Send Message

Sends a chat message and receives an AI response.

```http
POST /api/protocol-assistant/sessions/{session_id}/chat
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Request:**
```json
{
  "content": "What sections are missing from my protocol?",
  "message_type": "chat"
}
```

**Message Types:**
| Type | Description |
|------|-------------|
| `chat` | Regular conversation message (default) |
| `question` | User asking a question |
| `suggestion` | Following a suggested action |
| `action` | Requesting a specific action |
| `system` | System-generated message |

**Response:** `200 OK`
```json
{
  "response": "Based on your uploaded protocol, I've identified the following missing sections...",
  "message_id": 42,
  "suggestions": [
    "Help me address the sample size gap",
    "Generate an abstract for this study",
    "What's the most critical missing information?"
  ],
  "available_actions": [
    "generate_abstract",
    "prefill_form",
    "generate_consent",
    "view_gaps"
  ]
}
```

**Available Actions (based on session state):**
| Action | Description | When Available |
|--------|-------------|----------------|
| `upload_document` | Upload a protocol document | Always |
| `view_gaps` | View identified information gaps | Always |
| `generate_abstract` | Generate a study abstract | Protocol extracted |
| `prefill_form` | Pre-fill IRB form fields | Protocol extracted |
| `generate_consent` | Generate consent form draft | 50%+ complete |
| `generate_summary` | Generate protocol summary | 50%+ complete |
| `export_protocol` | Export completed protocol | 80%+ complete |
| `submit_for_review` | Submit for IRB review | 80%+ complete |

**Error Responses:**
- `404 Not Found`: Session does not exist
- `400 Bad Request`: Session is not active

### Get Chat History

Retrieves the chat message history for a session.

```http
GET /api/protocol-assistant/sessions/{session_id}/history
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Maximum messages to return (1-100) |
| `offset` | integer | 0 | Number of messages to skip |

**Response:** `200 OK`
```json
{
  "messages": [
    {
      "id": 1,
      "role": "user",
      "content": "I need help with my IRB protocol",
      "message_type": "chat",
      "metadata": null,
      "created_at": "2024-01-15T10:35:00Z"
    },
    {
      "id": 2,
      "role": "assistant",
      "content": "I'd be happy to help with your IRB protocol...",
      "message_type": "chat",
      "metadata": null,
      "created_at": "2024-01-15T10:35:05Z"
    }
  ],
  "total": 24,
  "limit": 50,
  "offset": 0
}
```

### Stream Response

Streams a chat response using Server-Sent Events (SSE).

```http
GET /api/protocol-assistant/sessions/{session_id}/stream?message={message}
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `message` | string | The message to send (required, min 1 char) |

**Response:** `200 OK` (text/event-stream)

The response is a stream of Server-Sent Events:

```
event: message
data: {"content": "Based on "}

event: message
data: {"content": "your protocol, "}

event: message
data: {"content": "I can see..."}

event: done
data: {"status": "complete"}
```

**Event Types:**
| Event | Description |
|-------|-------------|
| `message` | Content chunk with partial response |
| `done` | Stream completion signal |
| `error` | Error information |

**Response Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

**Error Responses:**
- `404 Not Found`: Session does not exist
- `400 Bad Request`: Session is not active

---

## Documents API

Document processing endpoints for parsing, PHI detection, and protocol extraction.

**Base URL:** `/api/documents`

**Content-Type:** `multipart/form-data` (for file uploads)

**File Limits:**
- Maximum file size: 10 MB
- Supported formats: PDF (.pdf), Word (.docx)
- Note: Legacy .doc format is not supported

### Parse Document

Parse a PDF or Word document and extract text and structure.

```http
POST /api/documents/parse
Content-Type: multipart/form-data
```

**Request:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | File | Yes | PDF (.pdf) or Word (.docx) document |

**Response:** `200 OK`
```json
{
  "success": true,
  "document": {
    "full_text": "Complete extracted text from the document...",
    "sections": [
      {
        "title": "INTRODUCTION",
        "content": "This study aims to investigate...",
        "page_number": 1,
        "heading_level": 1
      },
      {
        "title": "METHODOLOGY",
        "content": "We will employ a retrospective cohort design...",
        "page_number": 3,
        "heading_level": 1
      }
    ],
    "metadata": {
      "title": "Research Protocol",
      "author": "Dr. Jane Smith",
      "creation_date": "2024-01-15"
    },
    "word_count": 2500,
    "page_count": 10,
    "filename": "protocol.pdf",
    "file_type": ".pdf"
  },
  "error": null
}
```

**Error Response:**
```json
{
  "success": false,
  "document": null,
  "error": "Failed to parse PDF: encrypted or corrupted file"
}
```

**Error Cases:**
- `400 Bad Request`: Invalid file type or no filename
- `413 Request Entity Too Large`: File exceeds 10 MB limit

### Extract Protocol

Parse document and extract structured protocol information using AI.

```http
POST /api/documents/extract-protocol
Content-Type: multipart/form-data
```

**Request:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file` | File | Yes | - | Protocol document (PDF/DOCX) |
| `include_gap_analysis` | boolean | No | true | Include gap analysis |
| `include_quality_assessment` | boolean | No | false | Include quality assessment |

**Response:** `200 OK`
```json
{
  "success": true,
  "protocol": {
    "study_title": "Retrospective Analysis of Imaging Findings in COVID-19",
    "principal_investigator": "Dr. Jane Smith",
    "study_type": "retrospective",
    "objectives": {
      "primary": "To evaluate the diagnostic accuracy of chest CT in COVID-19 patients",
      "secondary": [
        "To identify common imaging patterns",
        "To correlate imaging findings with clinical outcomes"
      ]
    },
    "methodology": {
      "design": "Retrospective cohort study",
      "population": "Adult patients with confirmed COVID-19 diagnosis",
      "sample_size": "500 patients",
      "inclusion_criteria": [
        "Age 18 or older",
        "Confirmed COVID-19 diagnosis by PCR",
        "Chest CT performed within 7 days of diagnosis"
      ],
      "exclusion_criteria": [
        "Pre-existing lung disease",
        "Incomplete imaging data"
      ]
    },
    "data_collection": {
      "sources": ["Electronic medical records", "PACS imaging system"],
      "variables": ["Demographics", "Imaging findings", "Clinical outcomes"],
      "timeline": "January 2020 - December 2023"
    },
    "risks_benefits": {
      "risks": ["Minimal - retrospective review only", "Data breach potential"],
      "benefits": ["No direct benefits to subjects", "May improve diagnostic protocols"],
      "mitigation": ["Data de-identification", "Secure storage", "Limited access"]
    },
    "confidentiality_measures": "All data will be de-identified and stored on encrypted institutional servers with access limited to study personnel.",
    "missing_sections": ["Informed consent waiver justification"],
    "quality_score": 78,
    "recommendations": [
      "Add justification for waiver of informed consent",
      "Specify data retention period",
      "Include conflict of interest statement"
    ]
  },
  "gap_analysis": {
    "questions": [
      {
        "question": "What is the justification for requesting a waiver of informed consent?",
        "section": "consent",
        "priority": "high",
        "field_mapping": "consent.waiver_justification",
        "rationale": "IRB requires justification for retrospective studies without consent"
      },
      {
        "question": "What is the expected duration of data retention after study completion?",
        "section": "data_collection",
        "priority": "medium",
        "field_mapping": "data_management.retention_period",
        "rationale": "IRB requires specification of data retention policies"
      }
    ],
    "completeness_score": 75,
    "critical_gaps": ["Consent waiver justification"],
    "summary": "Protocol is largely complete but missing required consent documentation."
  },
  "error": null
}
```

**Study Types:**
| Value | Description |
|-------|-------------|
| `retrospective` | Retrospective study |
| `prospective` | Prospective study |
| `clinical_trial` | Clinical trial |
| `quality_improvement` | Quality improvement project |
| `educational` | Educational research |
| `other` | Other study type |

**PHI Handling:**
The endpoint automatically:
1. Scans the document for potential PHI
2. Redacts detected PHI before sending to the LLM for analysis
3. Logs PHI detection events (without exposing PHI content)

### Check PHI

Scan a document for Protected Health Information (PHI).

```http
POST /api/documents/check-phi
Content-Type: multipart/form-data
```

**Request:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `file` | File | Yes | - | Document to scan |
| `sensitivity` | string | No | "medium" | Detection level: "low", "medium", "high" |
| `include_redacted` | boolean | No | false | Include redacted text in response |

**Sensitivity Levels:**
| Level | Description |
|-------|-------------|
| `low` | Only detect clear PHI patterns (SSN with dashes, labeled MRN) |
| `medium` | Standard detection (default) |
| `high` | Aggressive detection, may have more false positives |

**Response:** `200 OK`
```json
{
  "has_phi": true,
  "matches": [
    {
      "type": "ssn",
      "start": 156,
      "end": 167,
      "text": "12*****89"
    },
    {
      "type": "phone",
      "start": 234,
      "end": 246,
      "text": "55*****12"
    },
    {
      "type": "email",
      "start": 340,
      "end": 365,
      "text": "pa****@ex*****om"
    }
  ],
  "redacted_text": "Patient SSN: [REDACTED-SSN], Phone: [REDACTED-PHONE], Email: [REDACTED-EMAIL]...",
  "phi_count": 3
}
```

**PHI Types Detected:**
| Type | Description | Example Pattern |
|------|-------------|-----------------|
| `mrn` | Medical Record Number | MRN: 1234567890 |
| `ssn` | Social Security Number | 123-45-6789 |
| `phone` | Phone numbers | (555) 123-4567 |
| `email` | Email addresses | patient@email.com |
| `dob` | Date of Birth | DOB: 01/15/1980 |
| `date` | General dates | 05/23/2024 |
| `ip_address` | IP addresses | 192.168.1.1 |
| `zip_code` | US Zip codes | 90210 |
| `name_title` | Names with titles | Dr. John Smith |
| `name_formal` | Formal names | Smith, John |

**Note:** This is pattern-based detection and may not catch all PHI. Human review is recommended for sensitive documents.

### Analyze Quality

Perform detailed quality assessment of an extracted protocol.

```http
POST /api/documents/analyze-quality
Content-Type: multipart/form-data
```

**Request:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file` | File | Yes | Protocol document (PDF/DOCX) |

**Response:** `200 OK`
```json
{
  "overall_score": 72,
  "section_scores": {
    "objectives": 85,
    "methodology": 75,
    "risks_benefits": 60,
    "data_collection": 70,
    "confidentiality": 80
  },
  "strengths": [
    "Clear primary objective",
    "Well-defined inclusion/exclusion criteria",
    "Comprehensive data security measures"
  ],
  "weaknesses": [
    "Risk mitigation strategies need more detail",
    "Missing informed consent waiver justification",
    "Timeline not specified"
  ],
  "irb_readiness": "Needs minor revisions",
  "estimated_completion": 75
}
```

**IRB Readiness Values:**
| Value | Description |
|-------|-------------|
| `Ready for submission` | Protocol is complete and well-documented |
| `Needs minor revisions` | Small gaps that can be quickly addressed |
| `Significant gaps remain` | Substantial work needed before submission |

### Usage Examples

**cURL - Parse Document:**
```bash
curl -X POST "http://localhost:8002/api/documents/parse" \
  -F "file=@protocol.pdf"
```

**cURL - Extract Protocol:**
```bash
curl -X POST "http://localhost:8002/api/documents/extract-protocol" \
  -F "file=@protocol.pdf" \
  -F "include_gap_analysis=true" \
  -F "include_quality_assessment=true"
```

**cURL - Check PHI:**
```bash
curl -X POST "http://localhost:8002/api/documents/check-phi" \
  -F "file=@protocol.pdf" \
  -F "sensitivity=high" \
  -F "include_redacted=true"
```

**Python:**
```python
import httpx

async def extract_protocol(file_path: str):
    async with httpx.AsyncClient() as client:
        with open(file_path, "rb") as f:
            response = await client.post(
                "http://localhost:8002/api/documents/extract-protocol",
                files={"file": f},
                params={
                    "include_gap_analysis": True,
                    "include_quality_assessment": True,
                },
            )
        return response.json()
```

**JavaScript/TypeScript:**
```typescript
async function parseDocument(file: File): Promise<DocumentParseResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/documents/parse', {
    method: 'POST',
    body: formData,
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error);
  }
  return result;
}
```

### Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/parse` | 60 requests | per minute |
| `/extract-protocol` | 20 requests | per minute |
| `/check-phi` | 60 requests | per minute |
| `/analyze-quality` | 20 requests | per minute |

---

## Generation API

AI-powered document generation for research protocols. The generation engine uses extracted protocol data and collected user answers to create high-quality, IRB-ready documents.

### Available Document Types

| Type | Description |
|------|-------------|
| `abstract` | Structured research abstract (100-500 words) |
| `consent_form` | Informed consent document |
| `protocol` | Complete protocol document |
| `recruitment_materials` | Participant recruitment flyers/materials |
| `data_management_plan` | Data governance and management plan |
| `budget_justification` | Budget justification (coming soon) |

### List Document Types

```http
GET /api/protocol-assistant/document-types
```

**Response:** `200 OK`

```json
{
  "document_types": [
    {
      "id": "abstract",
      "name": "Research Abstract",
      "description": "A structured abstract for IRB submission"
    },
    {
      "id": "consent_form",
      "name": "Informed Consent Form",
      "description": "A comprehensive informed consent document"
    },
    {
      "id": "protocol",
      "name": "Protocol Document",
      "description": "A complete research protocol document"
    },
    {
      "id": "recruitment_materials",
      "name": "Recruitment Materials",
      "description": "Participant recruitment flyers and materials"
    },
    {
      "id": "data_management_plan",
      "name": "Data Management Plan",
      "description": "A data governance and management plan"
    }
  ]
}
```

### Generate Abstract

```http
POST /api/protocol-assistant/sessions/{session_id}/generate/abstract
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `word_limit` | integer | 350 | Maximum word count (100-500) |

**Response:** `200 OK`

```json
{
  "doc_type": "abstract",
  "content": {
    "background": "This study addresses the critical need for...",
    "objectives": "The primary objective is to evaluate...",
    "methods": "This randomized controlled trial will enroll...",
    "expected_outcomes": "We anticipate significant improvements...",
    "significance": "This research will contribute to...",
    "word_count": 342
  },
  "word_count": 342,
  "quality_score": 85,
  "suggestions": [
    "Consider adding more detail to the methods section",
    "Include specific outcome measures"
  ],
  "generation_metadata": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 1250,
    "options": {"word_limit": 350}
  }
}
```

**Error Responses:**
- `400 Bad Request`: No protocol data extracted for session
- `404 Not Found`: Session not found
- `500 Internal Server Error`: Generation failed

### Generate Consent Form

```http
POST /api/protocol-assistant/sessions/{session_id}/generate/consent
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Response:** `200 OK`

```json
{
  "doc_type": "consent_form",
  "content": {
    "study_title": "Effects of Exercise on Cognitive Function in Older Adults",
    "purpose_of_study": "You are being invited to participate in a research study...",
    "procedures": "If you agree to participate, you will be asked to...",
    "risks": "The risks associated with this study include...",
    "benefits": "You may benefit from this study by...",
    "confidentiality": "Your privacy will be protected by...",
    "voluntary_participation": "Your participation is voluntary...",
    "contact_information": "If you have questions, contact...",
    "consent_statement": "I have read and understand the above information..."
  },
  "word_count": 1250,
  "quality_score": 90,
  "suggestions": [],
  "generation_metadata": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 2100
  }
}
```

### Generate Protocol Document

```http
POST /api/protocol-assistant/sessions/{session_id}/generate/protocol
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Response:** `200 OK`

```json
{
  "doc_type": "protocol",
  "content": {
    "title": "Effects of Exercise on Cognitive Function",
    "background": "Research has shown that regular physical activity...",
    "objectives": "Primary: Evaluate the effect of exercise on cognitive function...",
    "study_design": "This is a randomized controlled trial...",
    "participants": "Participants will be adults aged 65 and older...",
    "procedures": "Participants will complete baseline assessments...",
    "data_analysis": "We will use mixed-effects models to analyze...",
    "ethical_considerations": "This study will be conducted in accordance...",
    "timeline": "Enrollment: Months 1-6, Intervention: Months 2-14...",
    "references": [
      "Smith et al. (2023). Exercise and cognitive function. J Aging Health.",
      "Jones et al. (2022). Physical activity interventions. Neurology."
    ]
  },
  "word_count": 3500,
  "quality_score": 88,
  "suggestions": [
    "Add power analysis justification for sample size"
  ],
  "generation_metadata": {
    "provider": "claude",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 4500
  }
}
```

### Generate Recruitment Materials

```http
POST /api/protocol-assistant/sessions/{session_id}/generate/recruitment
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Response:** `200 OK`

```json
{
  "doc_type": "recruitment_materials",
  "content": {
    "study_title": "Exercise & Memory Study",
    "headline": "Are You 65 or Older? Join Our Exercise Study!",
    "eligibility_summary": "You may be eligible if you are 65+, healthy, and able to exercise",
    "what_to_expect": "12-week exercise program with cognitive assessments",
    "benefits_compensation": "$50 per visit compensation. Free fitness assessment.",
    "contact_info": "Call 555-1234 or email study@university.edu"
  },
  "word_count": 150,
  "quality_score": 92,
  "suggestions": [],
  "generation_metadata": {}
}
```

### Generate Data Management Plan

```http
POST /api/protocol-assistant/sessions/{session_id}/generate/data-management
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Response:** `200 OK`

```json
{
  "doc_type": "data_management_plan",
  "content": {
    "data_types": "Survey responses, cognitive test scores, exercise logs...",
    "data_collection": "Data will be collected using REDCap...",
    "data_storage": "All data will be stored on encrypted university servers...",
    "data_access": "Only approved study personnel will have access...",
    "data_retention": "Data will be retained for 7 years after study completion...",
    "backup_procedures": "Daily automated backups to secure cloud storage..."
  },
  "word_count": 800,
  "quality_score": 85,
  "suggestions": [
    "Consider adding data sharing policy for future research"
  ],
  "generation_metadata": {}
}
```

### Generate Any Document Type

```http
POST /api/protocol-assistant/sessions/{session_id}/generate
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `doc_type` | string | Yes | Document type to generate |
| `word_limit` | integer | No | Word limit for applicable types |

**Response:** `200 OK` - Same as individual document type responses

### Generate Multiple Documents

```http
POST /api/protocol-assistant/sessions/{session_id}/generate-all
```

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `doc_types` | array | Document types to generate (defaults to abstract, consent, protocol) |

**Response:** `200 OK`

```json
{
  "session_id": "123e4567-e89b-12d3-a456-426614174000",
  "total_requested": 3,
  "successful": 3,
  "failed": 0,
  "documents": [
    {
      "doc_type": "abstract",
      "content": { "..." },
      "word_count": 342,
      "quality_score": 85,
      "suggestions": []
    },
    {
      "doc_type": "consent_form",
      "content": { "..." },
      "word_count": 1250,
      "quality_score": 90,
      "suggestions": []
    },
    {
      "doc_type": "protocol",
      "content": { "..." },
      "word_count": 3500,
      "quality_score": 88,
      "suggestions": []
    }
  ]
}
```

### Pre-fill IRB Form

```http
POST /api/protocol-assistant/sessions/{session_id}/prefill-form/{form_id}
```

Pre-fill an existing IRB form with extracted protocol data.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |
| `form_id` | integer | The form instance ID |

**Response:** `200 OK`

```json
{
  "form_id": 123,
  "updated_fields": [
    "investigator.study_title",
    "investigator.pi_name",
    "objectives.primary_objective",
    "methodology.study_design",
    "methodology.sample_size"
  ],
  "skipped_fields": [
    "budget.total_amount"
  ],
  "message": "Successfully updated 5 fields from protocol data"
}
```

**Error Responses:**
- `400 Bad Request`: Form is not editable or version conflict
- `404 Not Found`: Session or form not found
- `500 Internal Server Error`: Pre-fill operation failed

### Create Pre-filled Form

```http
POST /api/protocol-assistant/sessions/{session_id}/create-prefilled-form
```

Create a new IRB form and pre-fill it with protocol data.

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | uuid | The session UUID |

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `template_id` | integer | Yes | Template ID to use |
| `title` | string | No | Form title (defaults to study title) |
| `project_id` | uuid | No | Project ID to associate |

**Response:** `200 OK`

```json
{
  "form_id": 456,
  "doc_type": "irb_form",
  "status": "draft",
  "completion_percentage": 25.0,
  "editable_url": "/forms/456"
}
```

**Error Response:**

```json
{
  "form_id": null,
  "doc_type": "irb_form",
  "status": "error",
  "completion_percentage": 0.0,
  "editable_url": null,
  "error": "Template not found"
}
```

### Field Mapping Reference

The following protocol fields are automatically mapped to IRB form fields:

| Protocol Field | Form Field |
|----------------|------------|
| `study_title` | `investigator.study_title` |
| `principal_investigator` | `investigator.pi_name` |
| `study_type` | `study_design.type` |
| `objectives.primary` | `objectives.primary_objective` |
| `objectives.secondary` | `objectives.secondary_objectives` |
| `methodology.design` | `methodology.study_design` |
| `methodology.population` | `methodology.study_population` |
| `methodology.sample_size` | `methodology.sample_size` |
| `methodology.inclusion_criteria` | `methodology.inclusion_criteria` |
| `methodology.exclusion_criteria` | `methodology.exclusion_criteria` |
| `risks_benefits.risks` | `risks.potential_risks` |
| `risks_benefits.benefits` | `risks.potential_benefits` |
| `confidentiality_measures` | `data_security.confidentiality_measures` |

### Generation Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/generate/abstract` | 20 requests | per minute |
| `/generate/consent` | 10 requests | per minute |
| `/generate/protocol` | 10 requests | per minute |
| `/generate-all` | 5 requests | per minute |
| `/prefill-form` | 30 requests | per minute |

---

## Admin API

> **Note:** This section will be completed by Agent K (Admin & Configuration)

Administrative endpoints for system configuration and management.

### Get System Configuration

```http
GET /api/v1/assistant/admin/config
```

**Required Role:** `admin`

**Response:**
```json
{
  "success": true,
  "data": {
    "llm_providers": {
      "primary": "anthropic",
      "fallback": "openai",
      "enabled": ["anthropic", "openai"]
    },
    "feature_flags": {
      "ai_suggestions": true,
      "advanced_compliance": true,
      "multi_language": false
    },
    "rate_limits": {
      "requests_per_minute": 60,
      "generations_per_hour": 100
    },
    "institution": {
      "id": "inst_456",
      "name": "University Medical Center",
      "settings": { ... }
    }
  }
}
```

### Update System Configuration

```http
PATCH /api/v1/assistant/admin/config
```

**Required Role:** `admin`

**Request:**
```json
{
  "feature_flags": {
    "multi_language": true
  }
}
```

### Get Feature Flags

```http
GET /api/v1/assistant/admin/feature-flags
```

**Response:**
```json
{
  "success": true,
  "data": {
    "flags": [
      {
        "name": "ai_suggestions",
        "enabled": true,
        "description": "Enable AI-powered suggestions",
        "scope": "institution"
      },
      {
        "name": "advanced_compliance",
        "enabled": true,
        "description": "Enable advanced compliance checking",
        "scope": "global"
      }
    ]
  }
}
```

### Update Feature Flag

```http
PUT /api/v1/assistant/admin/feature-flags/{flag_name}
```

**Request:**
```json
{
  "enabled": true,
  "scope": "institution",
  "institution_id": "inst_456"
}
```

### Get Audit Logs

```http
GET /api/v1/assistant/admin/audit-logs
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | datetime | Filter from date |
| `end_date` | datetime | Filter to date |
| `user_id` | string | Filter by user |
| `action_type` | string | Filter by action type |
| `page` | integer | Page number |

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "audit_123",
        "timestamp": "2024-01-15T10:30:00Z",
        "user_id": "usr_123",
        "action": "session.create",
        "resource_type": "session",
        "resource_id": "sess_abc123",
        "ip_address": "192.168.1.1",
        "details": { ... }
      }
    ],
    "pagination": { ... }
  }
}
```

### Get Usage Statistics

```http
GET /api/v1/assistant/admin/usage
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `period` | string | day, week, month |
| `start_date` | datetime | Start of period |

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "month",
    "metrics": {
      "total_sessions": 250,
      "total_generations": 1500,
      "total_tokens_used": 2500000,
      "active_users": 45,
      "compliance_checks": 300
    },
    "daily_breakdown": [ ... ],
    "top_users": [ ... ]
  }
}
```

---

## Integration API

> **Note:** This section will be completed by Agent J (External Integrations)

Endpoints for connecting with external services.

### Connect Zotero

```http
POST /api/v1/assistant/integrations/zotero/connect
```

**Request:**
```json
{
  "api_key": "zotero_api_key_here",
  "user_id": "zotero_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "connection_id": "conn_vwx234",
    "status": "connected",
    "library_count": 5,
    "item_count": 250,
    "connected_at": "2024-01-15T13:00:00Z"
  }
}
```

### Get Zotero Libraries

```http
GET /api/v1/assistant/integrations/zotero/libraries
```

**Response:**
```json
{
  "success": true,
  "data": {
    "libraries": [
      {
        "id": "lib_123",
        "name": "My Research",
        "type": "user",
        "item_count": 150
      },
      {
        "id": "lib_456",
        "name": "Lab Group",
        "type": "group",
        "item_count": 100
      }
    ]
  }
}
```

### Import Zotero References

```http
POST /api/v1/assistant/integrations/zotero/import
```

**Request:**
```json
{
  "session_id": "sess_abc123",
  "library_id": "lib_123",
  "item_ids": ["item_1", "item_2"],
  "import_all": false
}
```

### Connect Mendeley

```http
POST /api/v1/assistant/integrations/mendeley/connect
```

OAuth flow - returns authorization URL:
```json
{
  "success": true,
  "data": {
    "auth_url": "https://api.mendeley.com/oauth/authorize?...",
    "state": "state_token_here"
  }
}
```

### Mendeley OAuth Callback

```http
POST /api/v1/assistant/integrations/mendeley/callback
```

**Request:**
```json
{
  "code": "authorization_code",
  "state": "state_token_here"
}
```

### Connect REDCap

```http
POST /api/v1/assistant/integrations/redcap/connect
```

**Request:**
```json
{
  "api_url": "https://redcap.institution.edu/api/",
  "api_token": "redcap_api_token"
}
```

### Import REDCap Project

```http
POST /api/v1/assistant/integrations/redcap/import
```

**Request:**
```json
{
  "session_id": "sess_abc123",
  "project_id": "redcap_project_123",
  "import_fields": true,
  "import_instruments": true
}
```

### List Connected Integrations

```http
GET /api/v1/assistant/integrations
```

**Response:**
```json
{
  "success": true,
  "data": {
    "integrations": [
      {
        "type": "zotero",
        "status": "connected",
        "connected_at": "2024-01-15T13:00:00Z",
        "last_sync": "2024-01-15T14:00:00Z"
      },
      {
        "type": "mendeley",
        "status": "not_connected"
      },
      {
        "type": "redcap",
        "status": "connected",
        "connected_at": "2024-01-10T09:00:00Z"
      }
    ]
  }
}
```

### Disconnect Integration

```http
DELETE /api/v1/assistant/integrations/{integration_type}
```

---

## Error Responses

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTHENTICATION_ERROR` | 401 | Invalid or expired token |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `LLM_ERROR` | 502 | LLM provider error |
| `INTERNAL_ERROR` | 500 | Internal server error |

### Error Response Examples

**Validation Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "fields": {
        "protocol_type": "Invalid protocol type. Must be one of: human_subjects, animal_research, exempt"
      }
    }
  }
}
```

**Authentication Error:**
```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_ERROR",
    "message": "Token has expired",
    "details": {
      "expired_at": "2024-01-15T10:00:00Z"
    }
  }
}
```

**Rate Limit Error:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": {
      "limit": 60,
      "window": "minute",
      "retry_after": 45
    }
  }
}
```

**LLM Provider Error:**
```json
{
  "success": false,
  "error": {
    "code": "LLM_ERROR",
    "message": "LLM provider temporarily unavailable",
    "details": {
      "provider": "anthropic",
      "fallback_attempted": true,
      "retry_after": 30
    }
  }
}
```

---

## Rate Limiting

### Default Limits

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| General API | 60 requests | per minute |
| Generation endpoints | 20 requests | per minute |
| Document upload | 10 requests | per minute |
| Admin endpoints | 30 requests | per minute |

### Rate Limit Headers

All responses include rate limit headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1705319460
```

### Handling Rate Limits

When rate limited, the API returns a 429 status code with retry information:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded",
    "details": {
      "retry_after": 45
    }
  }
}
```

Clients should implement exponential backoff when receiving 429 responses.

---

## Pagination

All list endpoints support pagination with the following parameters:

| Parameter | Type | Default | Max |
|-----------|------|---------|-----|
| `page` | integer | 1 | - |
| `per_page` | integer | 20 | 100 |

Response includes pagination metadata:

```json
{
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 150,
    "total_pages": 8,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## Webhooks

> Coming soon: Webhook support for real-time notifications of events.

---

## SDK Support

Official SDKs are planned for:
- Python
- JavaScript/TypeScript
- R (for research workflows)

---

*Last updated: 2024-01-15*
