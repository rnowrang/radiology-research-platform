# Protocol Assistant Database Schema

This document describes the database schema for the Protocol Assistant service, including table structures, relationships, indexes, and compliance considerations.

## Overview

The Protocol Assistant database is designed to support:
- AI-powered chat sessions for protocol development
- Document generation and versioning
- A/B testing of AI prompts
- Compliance audit trails (HIPAA, 21 CFR Part 11)
- Multi-tenant institution management
- RAG (Retrieval-Augmented Generation) knowledge base
- Usage analytics and cost tracking
- External integrations

### Database Technology

- **Primary Database:** PostgreSQL 15+
- **Connection Pooling:** Async SQLAlchemy with pool management
- **ORM:** SQLAlchemy 2.0 (async)
- **Migrations:** Alembic

### Design Principles

1. **Audit Trail** - All tables include audit columns for compliance
2. **UUID Primary Keys** - Use UUIDs for all primary keys for security
3. **Multi-tenancy** - Institution-scoped data with proper isolation
4. **Versioning** - Support for document and content versioning
5. **JSON Flexibility** - JSONB columns for extensible metadata

## Entity Relationship Diagram

```
┌─────────────────────────┐
│ institution_feature_flags│
└───────────┬─────────────┘
            │
    ┌───────┼───────┬───────────────┬────────────────┐
    │       │       │               │                │
    ▼       ▼       ▼               ▼                ▼
┌───────┐ ┌────────────┐ ┌──────────────────┐ ┌────────────────┐
│usage_ │ │compliance_ │ │knowledge_        │ │institution_    │
│analytics│ │audit_log  │ │documents         │ │integrations    │
└───────┘ └────────────┘ └──────────────────┘ └────────────────┘

┌─────────────────┐       ┌─────────────────┐
│ prompt_versions │◄──────│ chat_messages   │
└─────────────────┘       └────────┬────────┘
        │                          │
        ▼                          ▼
┌─────────────────┐       ┌─────────────────┐
│ ai_feedback     │◄──────│ chat_sessions   │
└─────────────────┘       └────────┬────────┘
                                   │
        ┌──────────────────┬───────┴───────┬──────────────────┐
        │                  │               │                  │
        ▼                  ▼               ▼                  ▼
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│generated_      │ │provenance_     │ │session_        │ │session_        │
│documents       │ │nodes           │ │handoffs        │ │collaborators   │
└───────┬────────┘ └────────────────┘ └────────────────┘ └────────────────┘
        │
        ▼
┌────────────────┐
│electronic_     │
│signatures      │
└────────────────┘
```

## Tables

### 1. institution_feature_flags

Controls feature availability and configuration per institution.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| institution_id | UUID | Unique institution identifier |
| institution_name | VARCHAR(500) | Human-readable name |
| ai_assistant_enabled | BOOLEAN | Enable AI chat assistant |
| document_extraction_enabled | BOOLEAN | Enable document parsing |
| gap_analysis_enabled | BOOLEAN | Enable protocol gap detection |
| document_generation_enabled | BOOLEAN | Enable AI document generation |
| form_prefill_enabled | BOOLEAN | Enable form auto-fill |
| coherence_checking_enabled | BOOLEAN | Enable consistency validation |
| allowed_llm_providers | VARCHAR[] | Allowed AI providers |
| default_llm_provider | VARCHAR(50) | Default AI provider |
| fallback_behavior | VARCHAR(50) | Behavior on provider failure |
| max_retries | INTEGER | Max retry attempts |
| daily_request_limit | INTEGER | Daily API call limit |
| monthly_token_budget | INTEGER | Monthly token allowance |
| max_document_size_mb | INTEGER | Max upload size |
| integrations_enabled | JSONB | Integration toggles |
| custom_prompts_enabled | BOOLEAN | Allow custom prompts |
| rag_knowledge_base_enabled | BOOLEAN | Enable RAG features |
| ab_testing_enabled | BOOLEAN | Enable prompt A/B testing |
| audit_log_retention_days | INTEGER | Log retention period |
| require_electronic_signatures | BOOLEAN | Mandate e-signatures |
| cfr_part_11_compliant | BOOLEAN | 21 CFR Part 11 mode |

**Indexes:**
- `ix_institution_feature_flags_institution_id` (institution_id)

**Constraints:**
- `daily_request_limit > 0`
- `monthly_token_budget > 0`
- `max_document_size_mb > 0`
- `max_retries >= 0`

---

### 2. chat_sessions

Tracks conversation sessions between users and the AI assistant.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| project_id | UUID | Associated research project |
| user_id | UUID | Session owner |
| institution_id | UUID | User's institution |
| uploaded_document_id | VARCHAR(255) | Reference to uploaded protocol |
| document_filename | VARCHAR(500) | Original filename |
| extracted_protocol | JSONB | Parsed protocol structure |
| current_gaps | JSONB | Identified gaps list |
| collected_answers | JSONB | User responses to questions |
| status | VARCHAR(50) | active, completed, abandoned, handed_off |
| completion_percentage | INTEGER | Progress indicator |
| title | VARCHAR(500) | Session display title |
| summary | TEXT | AI-generated summary |
| llm_provider | VARCHAR(50) | AI provider used |
| total_tokens_used | INTEGER | Cumulative token usage |
| created_at | TIMESTAMP | Session start time |
| updated_at | TIMESTAMP | Last modification |
| completed_at | TIMESTAMP | Completion time |

**Indexes:**
- `ix_chat_sessions_project_id`
- `ix_chat_sessions_user_id`
- `ix_chat_sessions_institution_id`
- `ix_chat_sessions_project_user` (composite)
- `ix_chat_sessions_status`
- `ix_chat_sessions_created_at`

**Relationships:**
- Has many `chat_messages`
- Has many `generated_documents`
- Has many `ai_feedback`
- Has many `session_handoffs`
- Has many `provenance_nodes`
- Has many `session_collaborators`

---

### 3. chat_messages

Individual messages within a chat session.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| session_id | UUID | FK to chat_sessions |
| role | VARCHAR(20) | user, assistant, system |
| content | TEXT | Message content |
| message_type | VARCHAR(50) | chat, question, suggestion, action, error |
| metadata | JSONB | Additional context |
| prompt_version_id | INTEGER | FK to prompt_versions |
| tokens_used | INTEGER | Token count for this message |
| gap_id | VARCHAR(100) | Related gap identifier |
| created_at | TIMESTAMP | Message timestamp |

**Indexes:**
- `ix_chat_messages_session_id`
- `ix_chat_messages_session_created` (composite)
- `ix_chat_messages_role`

---

### 4. generated_documents

AI-generated documents with versioning.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to chat_sessions |
| project_id | UUID | Associated project |
| user_id | UUID | Creator |
| institution_id | UUID | Institution scope |
| document_type | VARCHAR(100) | protocol, consent_form, amendment |
| title | VARCHAR(500) | Document title |
| version | INTEGER | Version number |
| version_label | VARCHAR(100) | Human-readable version |
| content | TEXT | Document content (markdown) |
| content_html | TEXT | Rendered HTML |
| content_format | VARCHAR(50) | Content format type |
| template_id | UUID | Source template reference |
| generation_metadata | JSONB | LLM parameters used |
| source_data | JSONB | Input data for generation |
| status | VARCHAR(50) | draft, review, approved, final, archived |
| is_latest | BOOLEAN | Latest version flag |
| reviewed_by | UUID | Reviewer user ID |
| reviewed_at | TIMESTAMP | Review timestamp |
| quality_score | INTEGER | AI quality assessment (0-100) |
| coherence_score | INTEGER | Consistency score |
| completeness_score | INTEGER | Completeness score |
| content_hash | VARCHAR(64) | SHA-256 for integrity |
| parent_document_id | UUID | Previous version reference |

**Indexes:**
- `ix_generated_documents_session_id`
- `ix_generated_documents_project_id`
- `ix_generated_documents_project_type` (composite)
- `ix_generated_documents_status`
- `ix_generated_documents_created_at`

**Constraints:**
- `version > 0`
- `quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)`

---

### 5. prompt_versions

A/B testing configuration for AI prompts.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| prompt_key | VARCHAR(100) | Prompt identifier (e.g., "gap_analysis") |
| version | INTEGER | Version number |
| name | VARCHAR(200) | Display name |
| description | TEXT | Version description |
| content | TEXT | Prompt template |
| system_prompt | TEXT | System prompt if separate |
| parameters | JSONB | LLM parameters (temperature, etc.) |
| traffic_percentage | FLOAT | A/B traffic allocation (0-100) |
| is_active | BOOLEAN | Enabled for use |
| is_default | BOOLEAN | Fallback version |
| success_rate | FLOAT | Measured success rate |
| avg_quality_score | FLOAT | Average quality rating |
| avg_latency_ms | FLOAT | Average response time |
| sample_count | INTEGER | Number of uses |
| error_count | INTEGER | Error occurrences |
| created_by | UUID | Author |
| approved_by | UUID | Approver |
| approved_at | TIMESTAMP | Approval timestamp |
| retired_at | TIMESTAMP | Retirement timestamp |

**Indexes:**
- `ix_prompt_versions_prompt_key`
- `ix_prompt_versions_active`
- `ix_prompt_versions_key_active` (composite)

**Constraints:**
- `UNIQUE(prompt_key, version)`
- `traffic_percentage >= 0 AND traffic_percentage <= 100`
- `version > 0`

---

### 6. ai_feedback

User feedback on AI-generated outputs.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to chat_sessions |
| output_id | VARCHAR(255) | Reference to specific output |
| message_id | INTEGER | FK to chat_messages |
| document_id | UUID | FK to generated_documents |
| user_id | UUID | Feedback provider |
| institution_id | UUID | Institution context |
| rating | INTEGER | 1-5 scale rating |
| feedback_type | VARCHAR(50) | quality, accuracy, helpfulness, relevance |
| comment | TEXT | User comments |
| corrections | JSONB | Structured corrections |
| original_content | TEXT | Original AI output |
| corrected_content | TEXT | User-corrected version |
| prompt_version_id | INTEGER | FK to prompt_versions |
| issue_category | VARCHAR(100) | Error categorization |
| severity | VARCHAR(20) | low, medium, high, critical |

**Indexes:**
- `ix_ai_feedback_session_id`
- `ix_ai_feedback_user_id`
- `ix_ai_feedback_user_created` (composite)
- `ix_ai_feedback_type`
- `ix_ai_feedback_rating`

**Constraints:**
- `rating IS NULL OR (rating >= 1 AND rating <= 5)`

---

### 7. provenance_nodes

Audit trail for AI output lineage.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to chat_sessions |
| project_id | UUID | Project context |
| type | VARCHAR(50) | input, extraction, generation, edit, approval |
| actor | VARCHAR(255) | user_id, "system", or "llm:{provider}" |
| actor_type | VARCHAR(50) | user, system, llm |
| resource_type | VARCHAR(100) | document, message, section |
| resource_id | VARCHAR(255) | Resource identifier |
| data_hash | VARCHAR(64) | SHA-256 of content |
| parent_ids | UUID[] | Parent node references |
| depth | INTEGER | Tree depth level |
| metadata | JSONB | Additional context |
| llm_provider | VARCHAR(50) | AI provider if applicable |
| llm_model | VARCHAR(100) | Model used |
| prompt_version_id | INTEGER | Prompt version reference |
| action | VARCHAR(100) | Specific action taken |
| description | TEXT | Human-readable description |

**Indexes:**
- `ix_provenance_nodes_session_id`
- `ix_provenance_nodes_project_id`
- `ix_provenance_nodes_type`
- `ix_provenance_nodes_actor`
- `ix_provenance_nodes_resource` (composite)
- `ix_provenance_nodes_created_at`

---

### 8. compliance_audit_log

Append-only regulatory compliance log.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| institution_id | UUID | FK to institution_feature_flags |
| event_type | VARCHAR(100) | access, create, update, delete, export, login |
| resource_type | VARCHAR(100) | document, session, user |
| resource_id | VARCHAR(255) | Resource identifier |
| actor_id | UUID | Acting user |
| actor_name | VARCHAR(255) | Name at time of action |
| actor_email | VARCHAR(255) | Email at time of action |
| actor_role | VARCHAR(100) | Role at time of action |
| action | VARCHAR(100) | Action performed |
| action_detail | TEXT | Detailed description |
| details | JSONB | Structured details |
| ip_address | INET | Client IP |
| user_agent | TEXT | Client user agent |
| request_id | VARCHAR(100) | Request correlation ID |
| success | BOOLEAN | Action succeeded |
| error_message | TEXT | Error if failed |
| timestamp | TIMESTAMP | Immutable timestamp |

**Indexes:**
- `ix_compliance_audit_log_institution_id`
- `ix_compliance_audit_log_event_type`
- `ix_compliance_audit_log_timestamp`
- `ix_compliance_audit_log_actor_id`
- `ix_compliance_audit_log_actor_timestamp` (composite)
- `ix_compliance_audit_log_resource` (composite)

**Note:** This table should be protected from updates/deletes in production for compliance.

---

### 9. electronic_signatures

21 CFR Part 11 compliant electronic signatures.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| document_id | UUID | FK to generated_documents |
| document_version | INTEGER | Document version signed |
| document_hash | VARCHAR(64) | SHA-256 at signing |
| signer_id | UUID | Signing user |
| signer_name | VARCHAR(255) | Full name at signing |
| signer_email | VARCHAR(255) | Email at signing |
| signer_title | VARCHAR(255) | Title at signing |
| signer_institution | VARCHAR(500) | Institution at signing |
| meaning | VARCHAR(100) | approval, review, author, witness, acknowledgment |
| statement | TEXT | Optional statement |
| timestamp | TIMESTAMP | Signature timestamp |
| timezone | VARCHAR(50) | Signer's timezone |
| timestamp_utc | TIMESTAMP | UTC timestamp |
| system_id | VARCHAR(100) | System identifier |
| system_version | VARCHAR(50) | System version |
| signature_hash | VARCHAR(128) | Cryptographic signature |
| signature_algorithm | VARCHAR(50) | Algorithm used |
| public_key_fingerprint | VARCHAR(128) | PKI fingerprint if used |
| auth_method | VARCHAR(50) | password, mfa, biometric, certificate |
| auth_timestamp | TIMESTAMP | Authentication time |
| ip_address | INET | Client IP |
| user_agent | TEXT | Client user agent |
| is_valid | BOOLEAN | Signature validity |
| invalidated_at | TIMESTAMP | Invalidation time |
| invalidation_reason | TEXT | Reason for invalidation |

**Indexes:**
- `ix_electronic_signatures_document_id`
- `ix_electronic_signatures_signer`
- `ix_electronic_signatures_document_signer` (composite)
- `ix_electronic_signatures_timestamp`

**Constraints:**
- `meaning IN ('approval', 'review', 'author', 'witness', 'acknowledgment')`

---

### 10. session_handoffs

Session transfer between users.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to chat_sessions |
| from_user_id | UUID | Originating user |
| from_user_name | VARCHAR(255) | Name at handoff |
| to_user_id | UUID | Recipient user |
| to_user_name | VARCHAR(255) | Recipient name |
| to_user_email | VARCHAR(255) | Recipient email |
| handoff_note | TEXT | Message from sender |
| handoff_reason | VARCHAR(100) | collaboration, expertise_needed, unavailable |
| session_snapshot | JSONB | Session state at handoff |
| completion_at_handoff | INTEGER | Completion percentage |
| status | VARCHAR(50) | pending, accepted, declined, expired, cancelled |
| response_note | TEXT | Recipient's response |
| created_at | TIMESTAMP | Handoff creation time |
| responded_at | TIMESTAMP | Response time |
| expires_at | TIMESTAMP | Expiration time |

**Indexes:**
- `ix_session_handoffs_session_id`
- `ix_session_handoffs_from_user`
- `ix_session_handoffs_to_user`
- `ix_session_handoffs_status`
- `ix_session_handoffs_created_at`

**Constraints:**
- `status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')`

---

### 11. session_collaborators

Multi-user session access control.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to chat_sessions |
| user_id | UUID | Collaborator user |
| user_name | VARCHAR(255) | Display name |
| user_email | VARCHAR(255) | Email address |
| role | VARCHAR(50) | owner, editor, viewer, commenter |
| can_edit | VARCHAR(50) | Edit permission |
| can_invite | VARCHAR(50) | Invite permission |
| invited_by | UUID | Inviting user |
| invitation_status | VARCHAR(50) | pending, accepted, declined |
| last_accessed_at | TIMESTAMP | Last access time |
| contribution_count | INTEGER | Number of contributions |

**Indexes:**
- `ix_session_collaborators_session_id`
- `ix_session_collaborators_user_id`
- `ix_session_collaborators_session_user` (unique composite)
- `ix_session_collaborators_role`

**Constraints:**
- `role IN ('owner', 'editor', 'viewer', 'commenter')`

---

### 12. knowledge_documents

RAG knowledge base storage.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| institution_id | UUID | FK to institution_feature_flags (NULL = global) |
| title | VARCHAR(500) | Document title |
| description | TEXT | Document description |
| source_url | VARCHAR(1000) | Original source URL |
| source_filename | VARCHAR(500) | Original filename |
| content | TEXT | Document content |
| content_type | VARCHAR(50) | text, markdown, html |
| category | VARCHAR(100) | guidelines, templates, regulations |
| subcategory | VARCHAR(100) | Sub-categorization |
| tags | JSONB | Tag list |
| embedding_model | VARCHAR(100) | Embedding model used |
| has_embeddings | BOOLEAN | Embeddings generated |
| chunk_index | INTEGER | Chunk number if chunked |
| parent_document_id | UUID | Parent document reference |
| chunk_count | INTEGER | Total chunks |
| metadata | JSONB | Additional metadata |
| language | VARCHAR(10) | Document language |
| word_count | INTEGER | Word count |
| version | INTEGER | Version number |
| is_latest | BOOLEAN | Latest version flag |
| is_active | BOOLEAN | Active status |
| is_public | BOOLEAN | Visible to all institutions |
| added_by | UUID | Uploader |
| approved_by | UUID | Approver |
| approved_at | TIMESTAMP | Approval time |
| last_indexed_at | TIMESTAMP | Last embedding update |

**Indexes:**
- `ix_knowledge_documents_institution_id`
- `ix_knowledge_documents_category`
- `ix_knowledge_documents_active`
- `ix_knowledge_documents_institution_category` (composite)
- `ix_knowledge_documents_embeddings`

**Note:** Vector embeddings can be added using pgvector extension for semantic search.

---

### 13. knowledge_queries

RAG query logging for analytics.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | Session context |
| user_id | UUID | Querying user |
| institution_id | UUID | Institution context |
| query_text | TEXT | Query content |
| query_type | VARCHAR(50) | semantic, keyword, hybrid |
| result_count | INTEGER | Number of results |
| result_document_ids | JSONB | Retrieved document IDs |
| top_similarity_score | VARCHAR(20) | Highest similarity |
| latency_ms | INTEGER | Query latency |
| was_helpful | BOOLEAN | User feedback |
| user_feedback | TEXT | Detailed feedback |

**Indexes:**
- `ix_knowledge_queries_session_id`
- `ix_knowledge_queries_user_id`
- `ix_knowledge_queries_created_at`
- `ix_knowledge_queries_type`

---

### 14. usage_analytics

Daily aggregate usage statistics.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| institution_id | UUID | FK to institution_feature_flags |
| date | DATE | Aggregate date |
| session_count | INTEGER | Total sessions |
| session_starts | INTEGER | New sessions |
| session_completions | INTEGER | Completed sessions |
| session_abandonments | INTEGER | Abandoned sessions |
| document_count | INTEGER | Documents processed |
| documents_uploaded | INTEGER | Documents uploaded |
| documents_extracted | INTEGER | Documents extracted |
| generation_count | INTEGER | AI generations |
| prefill_count | INTEGER | Form prefills |
| gap_analyses_count | INTEGER | Gap analyses run |
| coherence_checks_count | INTEGER | Coherence checks |
| token_count | INTEGER | Total tokens |
| tokens_claude | INTEGER | Claude tokens |
| tokens_openai | INTEGER | OpenAI tokens |
| tokens_input | INTEGER | Input tokens |
| tokens_output | INTEGER | Output tokens |
| active_user_count | INTEGER | Active users |
| unique_users | JSONB | Unique user IDs |
| avg_session_duration_seconds | INTEGER | Average duration |
| avg_response_time_ms | INTEGER | Average latency |
| completion_rate | NUMERIC(5,2) | Completion percentage |
| error_count | INTEGER | Error occurrences |
| errors_by_type | JSONB | Error breakdown |
| cost_claude | NUMERIC(10,4) | Claude cost (USD) |
| cost_openai | NUMERIC(10,4) | OpenAI cost (USD) |
| cost_total | NUMERIC(10,4) | Total cost (USD) |
| feature_usage | JSONB | Feature usage counts |

**Indexes:**
- `ix_usage_analytics_institution_id`
- `ix_usage_analytics_date`
- `ix_usage_analytics_institution_date` (composite)

**Constraints:**
- `UNIQUE(institution_id, date)`

---

### 15. user_activities

Individual user activity tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Acting user |
| institution_id | UUID | Institution context |
| session_id | UUID | Session context |
| activity_type | VARCHAR(100) | Activity classification |
| activity_detail | VARCHAR(255) | Additional detail |
| metadata | JSONB | Activity metadata |
| resource_type | VARCHAR(100) | Resource type |
| resource_id | VARCHAR(255) | Resource identifier |
| duration_ms | INTEGER | Activity duration |
| success | BOOLEAN | Activity succeeded |

**Indexes:**
- `ix_user_activities_user_id`
- `ix_user_activities_institution_id`
- `ix_user_activities_session_id`
- `ix_user_activities_type`
- `ix_user_activities_user_created` (composite)
- `ix_user_activities_created_at`

---

### 16. feature_usage_metrics

Aggregated feature usage statistics.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| institution_id | UUID | Institution scope |
| user_id | UUID | User scope |
| feature_name | VARCHAR(100) | Feature identifier |
| feature_version | VARCHAR(50) | Feature version |
| invocation_count | INTEGER | Usage count |
| success_count | INTEGER | Successful uses |
| error_count | INTEGER | Failed uses |
| avg_latency_ms | INTEGER | Average latency |
| total_tokens | INTEGER | Token usage |
| period_start | TIMESTAMP | Period start |
| period_end | TIMESTAMP | Period end |

**Indexes:**
- `ix_feature_usage_metrics_institution_id`
- `ix_feature_usage_metrics_user_id`
- `ix_feature_usage_metrics_feature`
- `ix_feature_usage_metrics_period` (composite)

---

### 17. user_integration_credentials

Encrypted user credentials for external services.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Owning user |
| institution_id | UUID | Institution context |
| provider | VARCHAR(100) | Service provider |
| provider_instance | VARCHAR(255) | Specific instance |
| credentials_encrypted | BYTEA | Encrypted credentials |
| encryption_key_id | VARCHAR(100) | Encryption key reference |
| encryption_algorithm | VARCHAR(50) | Algorithm used |
| token_type | VARCHAR(50) | oauth2, api_key, basic, certificate |
| access_token_expires_at | TIMESTAMP | Token expiration |
| refresh_token_expires_at | TIMESTAMP | Refresh expiration |
| expires_at | TIMESTAMP | General expiration |
| scopes | JSONB | Granted scopes |
| permissions | JSONB | Provider permissions |
| is_active | BOOLEAN | Active status |
| is_valid | BOOLEAN | Validity status |
| last_used_at | TIMESTAMP | Last use time |
| last_error | TEXT | Last error message |
| error_count | INTEGER | Error count |
| metadata | JSONB | Additional metadata |

**Indexes:**
- `ix_user_integration_credentials_user_id`
- `ix_user_integration_credentials_institution_id`
- `ix_user_integration_credentials_provider`
- `ix_user_integration_credentials_user_provider` (composite)
- `ix_user_integration_credentials_expires`

**Constraints:**
- `UNIQUE(user_id, provider, provider_instance)`

---

### 18. institution_integrations

Institution-level integration configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| institution_id | UUID | Owning institution |
| integration_type | VARCHAR(100) | hl7_fhir, redcap, ehr, storage |
| integration_name | VARCHAR(255) | Display name |
| provider | VARCHAR(100) | Service provider |
| config | JSONB | Configuration (non-sensitive) |
| endpoint_url | VARCHAR(1000) | Service endpoint |
| credentials_encrypted | BYTEA | Encrypted credentials |
| encryption_key_id | VARCHAR(100) | Key reference |
| is_enabled | BOOLEAN | Enabled status |
| is_configured | BOOLEAN | Configuration complete |
| last_sync_at | TIMESTAMP | Last sync time |
| last_error | TEXT | Last error |
| health_status | VARCHAR(50) | healthy, degraded, error, unknown |
| sync_enabled | BOOLEAN | Sync enabled |
| sync_interval_minutes | INTEGER | Sync frequency |
| sync_config | JSONB | Sync configuration |

**Indexes:**
- `ix_institution_integrations_institution_id`
- `ix_institution_integrations_type`
- `ix_institution_integrations_enabled`

**Constraints:**
- `UNIQUE(institution_id, integration_type, provider)`

---

### 19. webhook_endpoints

Webhook configuration for event notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| institution_id | UUID | Institution scope |
| integration_id | UUID | FK to institution_integrations |
| name | VARCHAR(255) | Endpoint name |
| url | VARCHAR(1000) | Webhook URL |
| secret_key_encrypted | BYTEA | Encrypted secret |
| events | JSONB | Event subscriptions |
| filters | JSONB | Event filters |
| is_active | BOOLEAN | Active status |
| last_triggered_at | TIMESTAMP | Last trigger time |
| last_success_at | TIMESTAMP | Last success |
| last_failure_at | TIMESTAMP | Last failure |
| failure_count | INTEGER | Consecutive failures |
| max_retries | INTEGER | Max retry attempts |
| retry_delay_seconds | INTEGER | Retry delay |

**Indexes:**
- `ix_webhook_endpoints_institution_id`
- `ix_webhook_endpoints_integration_id`
- `ix_webhook_endpoints_active`

---

## Compliance Considerations

### HIPAA

- All PHI-containing tables should be encrypted at rest
- Audit logs must be retained for minimum 6 years
- Access logs track all data access events

### 21 CFR Part 11

- `electronic_signatures` table captures all required signature metadata
- `compliance_audit_log` provides append-only audit trail
- Signature meaning, timestamp, and signer identity are immutably recorded
- Authentication method and time are captured

### Data Retention

- Configurable per institution via `audit_log_retention_days`
- Default 2555 days (~7 years) for regulatory compliance
- Soft deletes recommended for most data

---

## Migration

Run the initial migration with:

```bash
cd protocol-assistant
alembic upgrade head
```

To generate new migrations after model changes:

```bash
alembic revision --autogenerate -m "description"
```

---

## Performance Considerations

1. **Partitioning**: Consider partitioning `compliance_audit_log` and `usage_analytics` by date for large deployments.

2. **Vector Search**: For `knowledge_documents`, enable pgvector extension and add vector column for efficient semantic search.

3. **Archival**: Implement archival strategy for old sessions and messages to maintain query performance.

4. **Connection Pooling**: Use async connection pooling (configured in database.py) for optimal performance.

---

## Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 001 | 2025-01-23 | Initial Protocol Assistant schema with all enterprise features |
