# Feature Flags Reference

This document provides a comprehensive reference for all feature flags in the Protocol Assistant service.

## Table of Contents

- [Overview](#overview)
- [Feature Flag List](#feature-flag-list)
- [Configuration](#configuration)
- [Institution-Level Configuration](#institution-level-configuration)
- [Admin UI Reference](#admin-ui-reference)
- [Programmatic Access](#programmatic-access)
- [Best Practices](#best-practices)

## Overview

Feature flags allow you to enable or disable functionality without deploying new code. They support:

- **Gradual Rollouts** - Enable features for specific institutions
- **A/B Testing** - Test new features with a subset of users
- **Kill Switches** - Quickly disable problematic features
- **Entitlements** - Control feature access by subscription tier

### Flag Scopes

| Scope | Description |
|-------|-------------|
| `global` | Applies to all institutions |
| `institution` | Can be overridden per institution |
| `user` | Can be set per user (premium) |

### Flag Types

| Type | Description |
|------|-------------|
| `boolean` | Simple on/off toggle |
| `percentage` | Gradual rollout (0-100%) |
| `variant` | A/B testing variants |

## Feature Flag List

### Core AI Features

#### `ai_suggestions`
Enable AI-powered suggestions during protocol creation.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
# Environment variable
FEATURE_AI_SUGGESTIONS=true
```

#### `streaming_responses`
Enable streaming for LLM responses (real-time typing effect).

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `global` |
| Type | `boolean` |

```bash
FEATURE_STREAMING_RESPONSES=true
```

#### `advanced_compliance_check`
Enable comprehensive compliance checking with detailed reports.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_ADVANCED_COMPLIANCE_CHECK=true
```

#### `auto_complete_sections`
Enable automatic completion suggestions for protocol sections.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_AUTO_COMPLETE_SECTIONS=true
```

### Document Features

#### `document_versioning`
Enable version history for documents.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `global` |
| Type | `boolean` |

```bash
FEATURE_DOCUMENT_VERSIONING=true
```

#### `pdf_export`
Enable PDF export functionality.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `global` |
| Type | `boolean` |

```bash
FEATURE_PDF_EXPORT=true
```

#### `docx_export`
Enable Word document export functionality.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `global` |
| Type | `boolean` |

```bash
FEATURE_DOCX_EXPORT=true
```

#### `document_ocr`
Enable OCR for scanned document uploads.

| Property | Value |
|----------|-------|
| Default | `false` |
| Scope | `institution` |
| Type | `boolean` |
| Notes | Requires additional setup |

```bash
FEATURE_DOCUMENT_OCR=false
```

### Integration Features

#### `zotero_integration`
Enable Zotero reference manager integration.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_ZOTERO_INTEGRATION=true
```

#### `mendeley_integration`
Enable Mendeley reference manager integration.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_MENDELEY_INTEGRATION=true
```

#### `redcap_integration`
Enable REDCap data collection integration.

| Property | Value |
|----------|-------|
| Default | `false` |
| Scope | `institution` |
| Type | `boolean` |
| Notes | Requires REDCap API access |

```bash
FEATURE_REDCAP_INTEGRATION=false
```

### Collaboration Features

#### `multi_user_sessions`
Allow multiple users to collaborate on a protocol.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_MULTI_USER_SESSIONS=true
```

#### `real_time_collaboration`
Enable real-time collaborative editing (WebSocket-based).

| Property | Value |
|----------|-------|
| Default | `false` |
| Scope | `institution` |
| Type | `boolean` |
| Notes | Beta feature |

```bash
FEATURE_REAL_TIME_COLLABORATION=false
```

#### `commenting`
Enable inline commenting on protocol sections.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_COMMENTING=true
```

### Administrative Features

#### `custom_templates`
Allow institutions to create custom protocol templates.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_CUSTOM_TEMPLATES=true
```

#### `usage_analytics`
Enable usage analytics dashboard.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_USAGE_ANALYTICS=true
```

#### `audit_log_export`
Allow export of audit logs.

| Property | Value |
|----------|-------|
| Default | `true` |
| Scope | `institution` |
| Type | `boolean` |

```bash
FEATURE_AUDIT_LOG_EXPORT=true
```

#### `sso_authentication`
Enable Single Sign-On authentication.

| Property | Value |
|----------|-------|
| Default | `false` |
| Scope | `institution` |
| Type | `boolean` |
| Notes | Requires SSO configuration |

```bash
FEATURE_SSO_AUTHENTICATION=false
```

### Experimental Features

#### `multi_language_support`
Enable multi-language protocol generation.

| Property | Value |
|----------|-------|
| Default | `false` |
| Scope | `global` |
| Type | `boolean` |
| Notes | Experimental |

```bash
FEATURE_MULTI_LANGUAGE_SUPPORT=false
```

#### `voice_input`
Enable voice input for protocol creation.

| Property | Value |
|----------|-------|
| Default | `false` |
| Scope | `global` |
| Type | `boolean` |
| Notes | Experimental |

```bash
FEATURE_VOICE_INPUT=false
```

#### `ai_risk_assessment`
Enable automated risk assessment scoring.

| Property | Value |
|----------|-------|
| Default | `false` |
| Scope | `institution` |
| Type | `boolean` |
| Notes | Experimental |

```bash
FEATURE_AI_RISK_ASSESSMENT=false
```

## Configuration

### Environment Variables

Set feature flags via environment variables:

```bash
# In .env file
FEATURE_AI_SUGGESTIONS=true
FEATURE_STREAMING_RESPONSES=true
FEATURE_ZOTERO_INTEGRATION=true
FEATURE_REDCAP_INTEGRATION=false
```

### Configuration File

Alternatively, use a configuration file:

```yaml
# config/features.yaml
feature_flags:
  ai_suggestions:
    enabled: true
    scope: institution
    description: "Enable AI-powered suggestions"

  streaming_responses:
    enabled: true
    scope: global

  zotero_integration:
    enabled: true
    scope: institution

  redcap_integration:
    enabled: false
    scope: institution
    conditions:
      subscription_tier: ["enterprise"]
```

### Priority Order

Feature flag values are resolved in this order (highest priority first):

1. User-level override (if scope allows)
2. Institution-level override
3. Environment variable
4. Configuration file
5. Default value

## Institution-Level Configuration

### Override via Admin API

```http
PUT /api/v1/assistant/admin/feature-flags/ai_suggestions
Authorization: Bearer <admin_token>

{
  "enabled": false,
  "institution_id": "inst_456"
}
```

### Override via Database

```sql
INSERT INTO feature_flags (name, enabled, scope, institution_id)
VALUES ('ai_suggestions', false, 'institution', 'inst_456')
ON CONFLICT (name, institution_id)
DO UPDATE SET enabled = false;
```

### Conditional Flags

Some flags can have conditions:

```yaml
redcap_integration:
  enabled: true
  scope: institution
  conditions:
    subscription_tier:
      - enterprise
      - professional
    institution_type:
      - medical_center
      - research_university
```

## Admin UI Reference

### Accessing Feature Flags

1. Log in as an administrator
2. Navigate to **Settings** > **Feature Flags**
3. View all available flags with current status

### Feature Flag Interface

```
┌─────────────────────────────────────────────────────────────────┐
│                      Feature Flags                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ AI Suggestions                              [ENABLED ●]   │  │
│  │ Enable AI-powered suggestions during protocol creation   │  │
│  │ Scope: Institution                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ REDCap Integration                         [DISABLED ○]  │  │
│  │ Enable REDCap data collection integration                 │  │
│  │ Scope: Institution | Requires: Enterprise tier            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Real-time Collaboration                    [DISABLED ○]  │  │
│  │ Enable real-time collaborative editing (Beta)             │  │
│  │ Scope: Institution | Status: Experimental                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Enabling/Disabling Flags

1. Click on a feature flag
2. Toggle the switch to enable/disable
3. Confirm the change
4. View the change in audit log

### Bulk Operations

```
Actions: [Enable All Standard] [Disable All Experimental] [Reset to Defaults]
```

## Programmatic Access

### Python SDK

```python
from app.services.feature_flags import FeatureFlagService

flags = FeatureFlagService()

# Check if feature is enabled
if flags.is_enabled("ai_suggestions", institution_id="inst_456"):
    # Feature is enabled
    pass

# Get all flags for institution
all_flags = flags.get_all_flags(institution_id="inst_456")
```

### API Access

```http
GET /api/v1/assistant/admin/feature-flags
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "data": {
    "flags": [
      {
        "name": "ai_suggestions",
        "enabled": true,
        "scope": "institution",
        "description": "Enable AI-powered suggestions"
      }
    ]
  }
}
```

### Frontend Access

```typescript
// React hook
import { useFeatureFlag } from '@/hooks/useFeatureFlag';

function MyComponent() {
  const aiSuggestionsEnabled = useFeatureFlag('ai_suggestions');

  if (!aiSuggestionsEnabled) {
    return null;
  }

  return <AISuggestionsPanel />;
}
```

## Prompt Management and A/B Testing

The Protocol Assistant includes a comprehensive prompt versioning system that enables controlled rollout of prompt changes and A/B testing of different prompt variants.

### Prompt Version Management

Prompts are versioned and tracked in the database. Each prompt has:
- A unique `prompt_key` identifier (e.g., "gap_analysis", "document_generation")
- Sequential version numbers
- Active/inactive status
- Traffic percentage for A/B testing
- Performance metrics (success rate, quality score, latency)

#### Creating a New Prompt Version

```http
POST /api/admin/prompts
Authorization: Bearer <admin_token>

{
  "prompt_key": "gap_analysis",
  "content": "Analyze the following protocol for gaps...",
  "name": "Improved Gap Analysis v2",
  "description": "Added more specific guidance for safety sections"
}
```

New versions are created in **inactive** state by default. This allows for review before deployment.

#### Activating a Prompt Version

```http
POST /api/admin/prompts/versions/{version_id}/activate
Authorization: Bearer <admin_token>

{
  "traffic_percentage": 100
}
```

| Traffic Percentage | Behavior |
|-------------------|----------|
| `100` | This version becomes the sole active version; all others are deactivated |
| `< 100` | This version is added to the A/B test pool |

#### Listing Versions

```http
GET /api/admin/prompts/{prompt_key}/versions
Authorization: Bearer <admin_token>
```

Response includes performance metrics for each version:
- `success_rate`: Percentage of successful outputs
- `avg_quality_score`: Average user quality rating (0-1)
- `sample_count`: Number of uses
- `avg_latency_ms`: Average response time

### A/B Testing

A/B testing allows you to compare prompt variants in production:

1. **Create variants** - Create multiple prompt versions for the same key
2. **Set traffic split** - Activate each variant with a traffic percentage
3. **Monitor metrics** - Compare success rates and quality scores
4. **Declare winner** - Activate the best variant at 100%

#### Example: Running an A/B Test

```bash
# Step 1: Create variant B
curl -X POST /api/admin/prompts \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt_key": "gap_analysis", "content": "New prompt text..."}'

# Step 2: Activate both variants
# Variant A (current) at 50%
curl -X POST /api/admin/prompts/versions/1/activate \
  -d '{"traffic_percentage": 50}'

# Variant B (new) at 50%
curl -X POST /api/admin/prompts/versions/2/activate \
  -d '{"traffic_percentage": 50}'

# Step 3: Compare after sufficient samples
curl -X GET /api/admin/prompts/compare/1/2

# Step 4: Declare winner at 100%
curl -X POST /api/admin/prompts/versions/2/activate \
  -d '{"traffic_percentage": 100}'
```

#### Comparing Versions

```http
GET /api/admin/prompts/compare/{version_a}/{version_b}
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "version_a": {
    "id": 1,
    "version": 1,
    "success_rate": 0.85,
    "avg_quality_score": 0.78,
    "avg_latency_ms": 2500,
    "sample_count": 150
  },
  "version_b": {
    "id": 2,
    "version": 2,
    "success_rate": 0.92,
    "avg_quality_score": 0.84,
    "avg_latency_ms": 2300,
    "sample_count": 145
  },
  "comparison": {
    "success_rate_diff": -0.07,
    "quality_score_diff": -0.06,
    "latency_diff": 200
  }
}
```

### Feedback Collection

User feedback is collected on AI outputs and linked to prompt versions:

```http
POST /api/admin/feedback
Authorization: Bearer <token>

{
  "session_id": "uuid",
  "output_id": "msg_123",
  "rating": 4,
  "feedback_type": "accuracy",
  "comment": "Good analysis but missed one section",
  "prompt_version_id": 2
}
```

#### Feedback Types

| Type | Description |
|------|-------------|
| `accuracy` | Factual correctness |
| `completeness` | Coverage of relevant points |
| `clarity` | How clear and understandable |
| `helpfulness` | Overall usefulness |
| `relevance` | Appropriateness for the task |

#### Viewing Feedback Summary

```http
GET /api/admin/feedback/summary?days=30
Authorization: Bearer <admin_token>
```

Response:
```json
{
  "total_count": 245,
  "avg_rating": 4.2,
  "rating_distribution": {
    "1": 5,
    "2": 12,
    "3": 28,
    "4": 95,
    "5": 105
  },
  "by_type": {
    "accuracy": 4.3,
    "completeness": 4.1,
    "clarity": 4.4
  },
  "trend": "improving",
  "recent_comments": ["..."]
}
```

### Knowledge Base (RAG)

The knowledge base provides context augmentation for prompts:

```http
# Add a document
POST /api/admin/knowledge
Authorization: Bearer <admin_token>

{
  "title": "IRB Consent Form Guidelines",
  "content": "Full document text...",
  "category": "guidelines",
  "tags": ["consent", "irb", "regulations"]
}

# Search the knowledge base
GET /api/admin/knowledge/search?query=consent+form+requirements
```

#### Categories

Common knowledge base categories:
- `guidelines` - Institutional guidelines
- `regulations` - Regulatory requirements
- `templates` - Document templates
- `examples` - Example protocols
- `faq` - Frequently asked questions

### Usage Analytics

Track usage and costs:

```http
# Usage summary
GET /api/admin/analytics/usage?start_date=2024-01-01&end_date=2024-01-31

# Cost breakdown
GET /api/admin/analytics/costs?start_date=2024-01-01&end_date=2024-01-31

# Quality metrics
GET /api/admin/analytics/quality?start_date=2024-01-01&end_date=2024-01-31
```

Response includes:
- Session counts
- Document processing counts
- Token usage
- Cost by provider (Claude, OpenAI)
- Projected monthly costs
- Quality metrics

## Best Practices

### Naming Conventions

- Use `snake_case` for flag names
- Be descriptive but concise
- Group related flags with prefixes (e.g., `integration_zotero`)

### Documentation

- Always document new flags in this file
- Include scope, default value, and any conditions
- Note if flag is experimental or deprecated

### Lifecycle Management

1. **New Feature** - Add flag, disabled by default
2. **Testing** - Enable for test institutions
3. **Rollout** - Gradually enable for more institutions
4. **General Availability** - Enable by default
5. **Cleanup** - Remove flag after feature is stable

### Deprecation Process

1. Mark flag as deprecated in documentation
2. Log warnings when deprecated flag is accessed
3. Communicate timeline to institution admins
4. Remove flag after deprecation period (minimum 3 months)

### Performance Considerations

- Feature flag checks should be fast (< 1ms)
- Cache flag values appropriately
- Avoid checking flags in tight loops
- Use batch retrieval for multiple flags

---

*This document is updated as new feature flags are added.*
