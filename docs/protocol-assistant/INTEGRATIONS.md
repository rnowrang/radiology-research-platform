# External Integrations Guide

This document provides setup and configuration instructions for external service integrations in the Protocol Assistant.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Zotero Integration](#zotero-integration)
- [Mendeley Integration](#mendeley-integration)
- [REDCap Integration](#redcap-integration)
- [Adding New Integrations](#adding-new-integrations)
- [Troubleshooting](#troubleshooting)

## Overview

The Protocol Assistant supports integrations with external research tools to streamline protocol creation:

| Integration | Purpose | Auth Type | Status |
|-------------|---------|-----------|--------|
| Zotero | Reference management | API Key | Implemented |
| Mendeley | Reference management | OAuth 2.0 | Implemented |
| REDCap | Data collection forms | API Token | Implemented |
| ORCID | Researcher identification | OAuth 2.0 | Planned |
| PubMed | Literature search | API Key | Planned |
| ClinicalTrials.gov | Trial registration | API Key | Planned |

### Integration Architecture

```
+-------------------------------------------------------------------+
|                   INTEGRATION FRAMEWORK                            |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  |                 Integration Manager                          |  |
|  |  - Connection management                                     |  |
|  |  - Credential storage (encrypted via Fernet)                 |  |
|  |  - Token refresh (automatic for OAuth)                       |  |
|  |  - Error handling                                            |  |
|  +--------------------------------------------------------------+  |
|                              |                                      |
|           +------------------+------------------+                   |
|           v                  v                  v                   |
|  +-------------------+ +-------------------+ +-------------------+  |
|  | ZoteroIntegration | |MendeleyIntegration| | REDCapIntegration |  |
|  | (IntegrationProvider)|                   |                    |  |
|  +-------------------+ +-------------------+ +-------------------+  |
|           |                  |                  |                   |
|           v                  v                  v                   |
|  +-------------------+ +-------------------+ +-------------------+  |
|  |   Zotero API      | |  Mendeley API     | |   REDCap API      |  |
|  | api.zotero.org    | | api.mendeley.com  | | institution URL   |  |
|  +-------------------+ +-------------------+ +-------------------+  |
|                                                                    |
+--------------------------------------------------------------------+
```

## Configuration

### Environment Variables

Add the following environment variables to your `.env` file:

```env
# Encryption key for credential storage
# Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=your-fernet-encryption-key

# Mendeley OAuth (required for Mendeley integration)
MENDELEY_CLIENT_ID=your-mendeley-client-id
MENDELEY_CLIENT_SECRET=your-mendeley-client-secret
```

### Generating an Encryption Key

For secure credential storage, generate a Fernet encryption key:

```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

Use this key as your `ENCRYPTION_KEY` environment variable.

### Required Dependencies

Ensure these are in your `requirements.txt`:

```txt
httpx>=0.26.0
cryptography>=42.0.0
```

## API Reference

### Common Endpoints

#### List Available Providers

```http
GET /api/integrations/providers
```

Returns information about available integration providers.

**Response:**
```json
[
  {
    "name": "zotero",
    "auth_type": "api_key",
    "description": "Zotero reference manager - access your library and format citations",
    "requires_oauth": false
  },
  {
    "name": "mendeley",
    "auth_type": "oauth",
    "description": "Mendeley reference manager - sync documents and folders",
    "requires_oauth": true,
    "oauth_url": "https://api.mendeley.com/oauth/authorize"
  },
  {
    "name": "redcap",
    "auth_type": "api_token",
    "description": "REDCap research data capture - sync forms and data",
    "requires_oauth": false
  }
]
```

#### Connect an Integration

```http
POST /api/integrations/connect
Content-Type: application/json

{
  "provider": "zotero",
  "credentials": {
    "api_key": "your-zotero-api-key"
  }
}
```

**Response:**
```json
{
  "success": true,
  "provider": "zotero",
  "message": "Successfully connected",
  "user_id": "12345",
  "metadata": {
    "username": "researcher",
    "access": {"user": {"library": true}}
  }
}
```

#### Disconnect an Integration

```http
DELETE /api/integrations/{provider}
```

#### Check Integration Status

```http
GET /api/integrations/{provider}/status
```

**Response:**
```json
{
  "provider": "zotero",
  "connected": true,
  "is_valid": true,
  "expires_at": null,
  "last_used_at": "2024-01-15T10:30:00Z",
  "metadata": {"username": "researcher"}
}
```

#### Get All Integration Statuses

```http
GET /api/integrations/status
```

---

## Zotero Integration

Zotero is a free, open-source reference management tool. The Protocol Assistant integrates with Zotero to import citations and references directly into protocols.

### Prerequisites

- Zotero account (https://www.zotero.org)
- API key from Zotero settings

### Setup Steps

#### 1. Obtain Zotero API Key

1. Log in to Zotero at https://www.zotero.org
2. Navigate to **Settings** > **Feeds/API**
3. Under "Personal API Keys", click **Create new private key**
4. Configure permissions:
   - Library Access: Read Only (recommended)
   - Notes Access: Read Only
   - Write Access: Not required
5. Copy the generated API key

#### 2. Connect via API

```http
POST /api/integrations/connect
Content-Type: application/json

{
  "provider": "zotero",
  "credentials": {
    "api_key": "your_zotero_api_key"
  }
}
```

The user ID is automatically retrieved from the API key validation.

### API Endpoints

#### Search Library

```http
POST /api/integrations/zotero/search
Content-Type: application/json

{
  "query": "machine learning radiology",
  "limit": 50
}
```

**Response:**
```json
[
  {
    "id": "ABC123",
    "title": "Deep Learning in Medical Imaging",
    "authors": ["Smith, John", "Doe, Jane"],
    "year": 2023,
    "journal": "Radiology",
    "doi": "10.1000/example",
    "abstract": "...",
    "item_type": "journalArticle",
    "url": "https://example.com/paper",
    "pages": "1-15",
    "volume": "45",
    "issue": "3",
    "tags": ["AI", "radiology"]
  }
]
```

#### Get Library Items

```http
GET /api/integrations/zotero/library?limit=100&offset=0
```

#### Format Citations

```http
POST /api/integrations/zotero/format
Content-Type: application/json

{
  "item_keys": ["ABC123", "DEF456"],
  "style": "apa"
}
```

**Response:**
```json
[
  {
    "id": "ABC123",
    "formatted": "Smith, J., & Doe, J. (2023). Deep Learning in Medical Imaging. Radiology, 45(3), 1-15.",
    "style": "apa"
  }
]
```

**Supported citation styles:**
- `apa` (default)
- `mla`
- `chicago-note-bibliography`
- `harvard-cite-them-right`
- `vancouver`
- `ieee`
- `nature`
- `science`
- `cell`

### Frontend Implementation

```typescript
async function connectZotero(apiKey: string) {
  const response = await fetch('/api/integrations/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'zotero',
      credentials: { api_key: apiKey }
    })
  });
  return response.json();
}

async function searchZotero(query: string) {
  const response = await fetch('/api/integrations/zotero/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 50 })
  });
  return response.json();
}
```

---

## Mendeley Integration

Mendeley is a reference manager and academic social network. The Protocol Assistant uses OAuth 2.0 for Mendeley integration.

### Prerequisites

- Mendeley account (https://www.mendeley.com)
- Registered OAuth application (for self-hosted deployments)

### Setup Steps

#### 1. Register OAuth Application

1. Go to Mendeley Developer Portal: https://dev.mendeley.com
2. Click **Create App**
3. Fill in application details:
   - Application name: "Protocol Assistant"
   - Redirect URL: `https://your-domain.com/callback/mendeley`
   - Description: "IRB Protocol Assistant integration"
4. Note the **Client ID** and **Client Secret**

#### 2. Configure Environment Variables

```bash
# In .env file
MENDELEY_CLIENT_ID=your_client_id
MENDELEY_CLIENT_SECRET=your_client_secret
```

### OAuth Flow

#### Step 1: Get Authorization URL

```http
POST /api/integrations/oauth/state
Content-Type: application/json

{
  "provider": "mendeley",
  "redirect_uri": "https://your-app.com/callback/mendeley"
}
```

**Response:**
```json
{
  "auth_url": "https://api.mendeley.com/oauth/authorize?client_id=...&redirect_uri=...&response_type=code&scope=all&state=...",
  "state": "random-state-token"
}
```

#### Step 2: Redirect User

Redirect the user to `auth_url`. After authorization, Mendeley redirects back to your `redirect_uri` with a `code` parameter.

#### Step 3: Exchange Code for Tokens

```http
POST /api/integrations/connect
Content-Type: application/json

{
  "provider": "mendeley",
  "credentials": {
    "code": "authorization-code-from-callback",
    "redirect_uri": "https://your-app.com/callback/mendeley"
  }
}
```

### API Endpoints

#### Search Library

```http
POST /api/integrations/mendeley/search
Content-Type: application/json

{
  "query": "clinical trial design",
  "limit": 50
}
```

### Token Refresh

The integration automatically refreshes expired tokens when making API calls. If refresh fails, the user will need to reconnect.

### Frontend Implementation

```typescript
// Step 1: Get auth URL
async function startMendeleyOAuth(redirectUri: string) {
  const response = await fetch('/api/integrations/oauth/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'mendeley',
      redirect_uri: redirectUri
    })
  });
  const { auth_url, state } = await response.json();

  // Store state for verification
  sessionStorage.setItem('mendeley_oauth_state', state);

  // Redirect to Mendeley
  window.location.href = auth_url;
}

// Step 2: Handle callback
async function handleMendeleyCallback(code: string, state: string, redirectUri: string) {
  // Verify state
  const savedState = sessionStorage.getItem('mendeley_oauth_state');
  if (state !== savedState) {
    throw new Error('Invalid OAuth state');
  }

  const response = await fetch('/api/integrations/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'mendeley',
      credentials: { code, redirect_uri: redirectUri }
    })
  });
  return response.json();
}
```

---

## REDCap Integration

REDCap (Research Electronic Data Capture) is a secure web application for building and managing online surveys and databases. The Protocol Assistant can import project metadata and instrument definitions from REDCap.

### Prerequisites

- REDCap project with API access enabled
- API token with appropriate permissions

### Setup Steps

#### 1. Enable API Access in REDCap

1. Log in to your REDCap instance
2. Navigate to your project
3. Go to **API** in the left menu
4. If API is not enabled, contact your REDCap administrator

#### 2. Generate API Token

1. In the API page, click **Request API token**
2. Select required permissions:
   - **Export**: Required for importing metadata
   - **Import**: Not required for Protocol Assistant
3. Submit request and wait for administrator approval
4. Copy the generated token

#### 3. Connect via API

```http
POST /api/integrations/connect
Content-Type: application/json

{
  "provider": "redcap",
  "credentials": {
    "api_url": "https://redcap.institution.edu/api/",
    "api_token": "your-project-api-token"
  }
}
```

### API Endpoints

#### List Forms

```http
GET /api/integrations/redcap/forms
```

**Response:**
```json
{
  "forms": ["demographics", "consent", "study_data", "adverse_events"]
}
```

#### Get Form Details

```http
GET /api/integrations/redcap/forms/{form_name}
```

**Response:**
```json
{
  "form": {
    "form_name": "demographics",
    "form_label": "Demographics",
    "fields": [
      {
        "field_name": "age",
        "field_label": "Age",
        "field_type": "text",
        "required": true,
        "validation": "integer",
        "validation_min": "0",
        "validation_max": "120",
        "branching_logic": null,
        "identifier": false
      },
      {
        "field_name": "sex",
        "field_label": "Sex",
        "field_type": "radio",
        "required": true,
        "choices": {"1": "Male", "2": "Female", "3": "Other"},
        "validation": null
      }
    ]
  }
}
```

#### Get IRB Field Mapping Suggestions

```http
POST /api/integrations/redcap/mapping-suggestions
Content-Type: application/json

{
  "irb_field_type": "study_title"
}
```

**Response:**
```json
[
  {
    "redcap_field": "project_title",
    "irb_field": "study_title",
    "confidence": 0.9,
    "mapping_type": "direct",
    "notes": "Matched pattern: title"
  },
  {
    "redcap_field": "protocol_title",
    "irb_field": "study_title",
    "confidence": 0.7,
    "mapping_type": "direct",
    "notes": "Matched pattern: title"
  }
]
```

**Supported IRB field types for mapping:**
- `study_title`
- `pi_name`
- `sponsor`
- `start_date`
- `end_date`
- `sample_size`
- `study_description`

### Security Considerations

REDCap may contain sensitive data. Ensure:

1. API tokens are stored encrypted (handled automatically)
2. Only metadata is imported (not actual participant data)
3. Institution policies allow API access
4. Audit logging is enabled for all REDCap operations

### Frontend Implementation

```typescript
async function connectRedcap(apiUrl: string, apiToken: string) {
  const response = await fetch('/api/integrations/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'redcap',
      credentials: { api_url: apiUrl, api_token: apiToken }
    })
  });
  return response.json();
}

async function getRedcapForms() {
  const response = await fetch('/api/integrations/redcap/forms');
  return response.json();
}
```

---

## Adding New Integrations

To add a new external integration, follow this pattern:

### 1. Create Integration Provider

```python
# app/integrations/new_service.py
from app.integrations.base import IntegrationProvider, AuthResult

class NewServiceIntegration(IntegrationProvider):
    name = "new_service"

    async def authenticate(self, credentials: dict) -> AuthResult:
        # Implementation
        pass

    async def refresh_token(self, refresh_token: str) -> AuthResult:
        # Implementation
        pass

    async def test_connection(self, access_token: str) -> bool:
        # Implementation
        pass
```

### 2. Export from __init__.py

```python
# app/integrations/__init__.py
from app.integrations.new_service import NewServiceIntegration

__all__ = [
    # ... existing exports
    "NewServiceIntegration",
]
```

### 3. Add Router Endpoints

Add provider-specific endpoints in `app/routers/integrations.py`.

### 4. Update Documentation

Add a section to this document with:
- Prerequisites
- Setup steps
- API endpoints
- Configuration options
- Usage examples

---

## Troubleshooting

### Common Issues

#### Connection Failures

**Symptoms:** "Failed to connect" or authentication errors

**Solutions:**
1. Verify API credentials are correct
2. Check network connectivity
3. Verify firewall rules allow outbound connections
4. Check service status pages

```bash
# Test connectivity
curl -I https://api.zotero.org
curl -I https://api.mendeley.com
```

#### OAuth Errors

**Symptoms:** "Invalid redirect URI" or "OAuth error"

**Solutions:**
1. Verify redirect URI matches exactly (including trailing slash)
2. Check OAuth credentials are correct
3. Ensure HTTPS is used for production
4. Verify state parameter matches

#### Rate Limiting

**Symptoms:** HTTP 429 errors

**Solutions:**
1. Reduce request frequency
2. Implement request queuing in your frontend
3. Use pagination for large data sets

#### Token Expiration

**Symptoms:** "Token expired" or "Session expired" errors

**Solutions:**
1. For Mendeley: Reconnect the integration
2. For Zotero/REDCap: Tokens don't expire, check if revoked

### Error Response Format

All endpoints return appropriate HTTP status codes:

- `200` - Success
- `400` - Bad request (invalid provider, missing parameters)
- `401` - Unauthorized (integration not connected, expired token)
- `500` - Server error

Error responses include a `detail` field:
```json
{
  "detail": "Zotero not connected. Please connect your Zotero account first."
}
```

### Health Checks

Check all integration statuses:

```http
GET /api/integrations/status
```

**Response:**
```json
[
  {
    "provider": "zotero",
    "connected": true,
    "is_valid": true,
    "last_used_at": "2024-01-15T10:30:00Z"
  },
  {
    "provider": "mendeley",
    "connected": true,
    "is_valid": false,
    "expires_at": "2024-01-14T10:30:00Z"
  }
]
```

---

## Database Schema

The integrations use the following database table from `app/models/integration.py`:

### UserIntegrationCredentials

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | User ID |
| provider | String | Provider name (zotero, mendeley, redcap) |
| provider_instance | String | Optional instance identifier |
| credentials_encrypted | LargeBinary | Encrypted credentials |
| token_type | String | oauth2, api_key, basic |
| expires_at | DateTime | Token expiration |
| is_active | Boolean | Whether integration is active |
| is_valid | Boolean | Whether credentials are valid |
| scopes | JSON | OAuth scopes granted |
| metadata | JSON | Additional metadata |

---

*Last updated: Implementation by Agent J (External Integrations)*
