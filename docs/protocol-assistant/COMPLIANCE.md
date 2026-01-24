# Compliance Documentation

This document outlines how the Protocol Assistant meets regulatory and compliance requirements for handling research data.

## Table of Contents

- [Overview](#overview)
- [Implementation Guide](#implementation-guide)
- [HIPAA Requirements](#hipaa-requirements)
- [21 CFR Part 11 Support](#21-cfr-part-11-support)
- [GDPR Considerations](#gdpr-considerations)
- [Audit Trail](#audit-trail)
- [Provenance Tracking](#provenance-tracking)
- [AI Explainability](#ai-explainability)
- [Data Retention Policies](#data-retention-policies)
- [Security Controls](#security-controls)
- [API Reference](#api-reference)
- [Compliance Checklist](#compliance-checklist)

## Overview

The Protocol Assistant is designed to support research institutions in maintaining compliance with:

- **HIPAA** - Health Insurance Portability and Accountability Act
- **21 CFR Part 11** - FDA regulations for electronic records and signatures
- **GDPR** - General Data Protection Regulation (for EU users)
- **Institutional Policies** - Customizable compliance rules

### Compliance Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLIANCE FRAMEWORK                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   ACCESS CONTROLS                         │  │
│  │  • Role-based access control (RBAC)                       │  │
│  │  • Multi-factor authentication                            │  │
│  │  • Session management                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   DATA PROTECTION                         │  │
│  │  • Encryption at rest (AES-256)                           │  │
│  │  • Encryption in transit (TLS 1.3)                        │  │
│  │  • PII detection and handling                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    AUDIT TRAIL                            │  │
│  │  • Complete activity logging                              │  │
│  │  • Tamper-evident records                                 │  │
│  │  • Retention policy enforcement                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Guide

The Protocol Assistant includes a comprehensive compliance framework implemented in:

- `app/compliance/` - Compliance standards and requirements
- `app/audit/` - Audit logging, provenance, and explainability
- `app/middleware/audit.py` - Automatic request/response logging

### Quick Start

```python
from app.compliance.hipaa import HIPAACompliance
from app.audit.provenance import ProvenanceChain
from app.audit.explainability import ExplainabilityService

# HIPAA compliance (always enabled)
hipaa = HIPAACompliance(phi_sensitivity="medium")

# Redact PHI before sending to external LLM
safe_text = await hipaa.ensure_phi_redacted(text_with_phi)

# Track provenance of AI operations
provenance = ProvenanceChain(db)
node_id = await provenance.record_extraction(
    session_id=session_id,
    source_document_id=doc_id,
    extracted_data=data,
    model_used="claude-3-opus",
    prompt_version="v1",
)

# Get explanations for AI decisions
explainer = ExplainabilityService(db)
explanation = await explainer.explain_extraction(node_id)
```

### Module Structure

```
app/
├── compliance/
│   ├── __init__.py           # Exports
│   ├── framework.py          # Base compliance classes
│   ├── hipaa.py             # HIPAA requirements (always enabled)
│   └── cfr21.py             # 21 CFR Part 11 (optional)
├── audit/
│   ├── __init__.py           # Exports
│   ├── provenance.py         # Data lineage tracking
│   ├── explainability.py     # AI decision explanations
│   └── audit_logger.py       # Compliance audit logging
├── middleware/
│   └── audit.py              # Automatic request logging
└── routers/
    └── audit.py              # Audit API endpoints
```

## HIPAA Requirements

### Administrative Safeguards

| Requirement | Implementation |
|-------------|----------------|
| Security Management | Risk assessment documentation, security policies |
| Assigned Security Responsibility | Designated security administrator role |
| Workforce Security | Background checks, access termination procedures |
| Information Access Management | Role-based access control, minimum necessary |
| Security Awareness Training | User training resources, policy acknowledgment |
| Security Incident Procedures | Incident response plan, breach notification |
| Contingency Plan | Backup procedures, disaster recovery |
| Evaluation | Regular security assessments |

### Technical Safeguards

#### Access Controls

```yaml
access_controls:
  # Unique user identification
  unique_user_ids: true
  user_id_format: "UUID v4"

  # Emergency access procedure
  emergency_access:
    enabled: true
    requires_approval: true
    audit_all_access: true

  # Automatic logoff
  session_timeout_minutes: 30
  idle_timeout_minutes: 15

  # Encryption and decryption
  data_encryption: "AES-256-GCM"
  key_management: "AWS KMS / HashiCorp Vault"
```

#### Audit Controls

```yaml
audit_controls:
  # Hardware/software/procedural mechanisms
  logging_enabled: true
  log_types:
    - user_authentication
    - data_access
    - data_modification
    - system_events
    - security_events

  # Immutable logs
  log_integrity:
    method: "cryptographic_hashing"
    algorithm: "SHA-256"
```

#### Integrity Controls

```yaml
integrity_controls:
  # Mechanism to authenticate ePHI
  data_authentication:
    enabled: true
    method: "HMAC-SHA256"

  # Protection from improper alteration
  change_detection:
    enabled: true
    checksums: true
```

#### Transmission Security

```yaml
transmission_security:
  # Encryption
  tls_version: "1.3"
  certificate_validation: true

  # Integrity controls
  message_authentication: true
```

### Physical Safeguards

For on-premises deployments, the following apply:

- Facility access controls
- Workstation use policies
- Workstation security
- Device and media controls

### PHI Handling

```yaml
phi_handling:
  # Detection
  phi_detection:
    enabled: true
    patterns:
      - social_security_numbers
      - medical_record_numbers
      - health_plan_ids
      - dates_of_birth
      - contact_information

  # Sanitization before LLM processing
  phi_sanitization:
    enabled: true
    method: "tokenization"
    reversible: true

  # Storage
  phi_storage:
    encrypted: true
    separate_database: false
    access_logging: true
```

### PHI Detection Implementation

The PHI detector (`app/services/phi_detector.py`) identifies the 18 HIPAA identifiers:

```python
from app.services.phi_detector import PHIDetector, get_phi_detector

# Get detector instance
detector = get_phi_detector(sensitivity="medium")

# Check if text contains PHI
if detector.has_phi(text):
    # Redact PHI before external transmission
    safe_text = detector.redact(text)

# Get detailed summary
summary = detector.get_phi_summary(text)
# Returns: {"total_count": 3, "has_phi": True, "by_type": {"ssn": {"count": 1}, ...}}
```

### HIPAA Compliance Class

```python
from app.compliance.hipaa import HIPAACompliance

hipaa = HIPAACompliance(phi_sensitivity="medium")

# Validate request context
results = await hipaa.validate_request({
    "text": user_input,
    "user_id": current_user_id,
    "resource_id": document_id,
    "audit_enabled": True,
})

# Check access authorization
result = await hipaa.check_access(
    user_id="user-123",
    resource_id="document-456",
    action="view",
    user_roles=["researcher"],
    required_roles=["researcher", "admin"],
)
```

### Business Associate Agreements

When using cloud LLM providers:

| Provider | BAA Available | Notes |
|----------|---------------|-------|
| Anthropic (Claude) | Contact sales | Required for PHI processing |
| OpenAI | Available | Enterprise tier required |
| Azure OpenAI | Available | Enterprise agreement required |

## 21 CFR Part 11 Support

### Electronic Records Requirements

#### Validation

| Requirement | Implementation |
|-------------|----------------|
| System validation | Documented validation procedures |
| Accuracy | Input validation, data integrity checks |
| Retrievability | Full audit trail, export capabilities |
| Protection | Role-based access, encryption |

#### Audit Trail

```yaml
audit_trail_21cfr11:
  # Computer-generated, time-stamped audit trail
  requirements:
    timestamp_source: "NTP synchronized"
    timestamp_format: "ISO 8601"
    includes:
      - date_time
      - operator_id
      - action_type
      - previous_value
      - new_value
      - reason_for_change

  # Independent of operator
  independence:
    method: "system_generated"
    tamper_evident: true

  # Available for agency review
  export_formats:
    - json
    - csv
    - pdf
```

#### Record Retention

```yaml
record_retention:
  # Retention during required period
  minimum_retention_years: 7
  archived_records:
    accessible: true
    retrievable: true
    original_format: preserved

  # Backup and recovery
  backup_frequency: daily
  backup_retention_days: 90
  recovery_testing: quarterly
```

### Electronic Signatures

#### Signature Requirements

```yaml
electronic_signatures:
  # Unique to one individual
  uniqueness: true

  # Not reused or reassigned
  non_transferable: true

  # Components
  components:
    - printed_name
    - date_and_time
    - meaning (e.g., "approved", "reviewed")

  # Verification before use
  identity_verification:
    required: true
    methods:
      - password
      - mfa_token
```

#### Signature Linking

```yaml
signature_linking:
  # Linked to respective record
  method: "cryptographic_binding"
  algorithm: "SHA-256 with RSA"

  # Cannot be excised, copied, or transferred
  non_repudiation:
    enabled: true
    verification: "digital_certificate"
```

### Controls for Identification

```yaml
identification_controls:
  # Before first use
  identity_proofing:
    required: true
    methods:
      - institutional_verification
      - manager_approval

  # Authority check before issuance
  authority_verification:
    approver_required: true

  # Periodic revision
  credential_rotation:
    password_expiry_days: 90
    mfa_reregistration_months: 12

  # Temporary or permanent revocation
  revocation:
    immediate_effect: true
    audit_logged: true
```

### Electronic Signature Implementation

```python
from app.compliance.cfr21 import CFR21Part11Compliance, SignatureCredentials

cfr21 = CFR21Part11Compliance(db)

# Create electronic signature
signature = await cfr21.sign_document(
    document_id=doc_uuid,
    document_version=1,
    document_content=document_bytes,
    signer_id=user_uuid,
    signer_name="Dr. Jane Smith",
    signer_email="jane.smith@hospital.edu",
    meaning="approval",  # approval, review, author, witness, acknowledgment
    credentials=SignatureCredentials(
        password="user_password",
        timezone="America/New_York",
        auth_method="password",
    ),
    signer_title="Principal Investigator",
    signer_institution="University Hospital",
)

# Verify signature
result = await cfr21.verify_signature(
    signature_id=signature.id,
    document_content=current_document_bytes,
)
if not result.is_valid:
    print(f"Signature invalid: {result.errors}")

# Check required signatures
result = await cfr21.check_signature_requirements(
    document_id=doc_uuid,
    required_signatures=[
        {"meaning": "author"},
        {"meaning": "review"},
        {"meaning": "approval"},
    ],
)
```

## GDPR Considerations

### Data Subject Rights

| Right | Implementation |
|-------|----------------|
| Right to Access | Data export functionality |
| Right to Rectification | User can edit personal data |
| Right to Erasure | Account deletion with data purge |
| Right to Portability | Standard format data export |
| Right to Object | Consent management |

### Consent Management

```yaml
consent_management:
  # Explicit consent collection
  consent_types:
    - data_processing
    - ai_processing
    - analytics

  # Consent storage
  consent_records:
    includes:
      - consent_text_version
      - timestamp
      - method_of_consent
      - ip_address

  # Consent withdrawal
  withdrawal:
    easy_process: true
    effective_immediately: true
```

### Data Processing Records

```yaml
processing_records:
  # Required documentation
  includes:
    - purpose_of_processing
    - categories_of_data_subjects
    - categories_of_personal_data
    - recipients
    - transfers_to_third_countries
    - retention_periods
    - security_measures
```

### Data Protection Impact Assessment

For high-risk processing activities (e.g., AI-based decision making):

1. Systematic description of processing
2. Assessment of necessity and proportionality
3. Assessment of risks to rights and freedoms
4. Measures to address risks

### International Data Transfers

```yaml
data_transfers:
  # For EU data subjects
  eu_data_location: "EU data centers"

  # Transfer mechanisms if needed
  mechanisms:
    - standard_contractual_clauses
    - adequacy_decisions

  # LLM provider considerations
  llm_processing:
    data_residency: "configurable"
    anonymization_before_transfer: optional
```

## Audit Trail

### What Is Logged

```yaml
audit_events:
  authentication:
    - login_success
    - login_failure
    - logout
    - password_change
    - mfa_enrollment
    - session_timeout

  authorization:
    - permission_granted
    - permission_denied
    - role_change

  data_access:
    - session_created
    - session_viewed
    - document_accessed
    - export_generated

  data_modification:
    - session_updated
    - document_uploaded
    - content_generated
    - content_modified
    - content_deleted

  administration:
    - user_created
    - user_modified
    - user_deactivated
    - configuration_changed
    - feature_flag_toggled
```

### Audit Log Format

```json
{
  "id": "audit_123e4567-e89b-12d3-a456-426614174000",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "event_type": "data_modification",
  "action": "session_updated",
  "user": {
    "id": "usr_789",
    "email": "researcher@institution.edu",
    "name": "Dr. Jane Smith",
    "roles": ["researcher"]
  },
  "institution_id": "inst_456",
  "resource": {
    "type": "protocol_session",
    "id": "sess_abc123"
  },
  "changes": {
    "field": "methodology.sample_size",
    "previous_value": "50",
    "new_value": "100"
  },
  "context": {
    "ip_address": "192.168.1.100",
    "user_agent": "Mozilla/5.0...",
    "request_id": "req_xyz789",
    "session_id": "web_session_123"
  },
  "integrity": {
    "hash": "sha256:abc123...",
    "previous_hash": "sha256:def456..."
  }
}
```

### Log Integrity

```yaml
log_integrity:
  # Tamper-evident chain
  chaining:
    enabled: true
    algorithm: "SHA-256"
    includes_previous_hash: true

  # Periodic integrity verification
  verification:
    frequency: hourly
    alert_on_failure: true

  # Log signing (optional)
  signing:
    enabled: false
    method: "RSA-4096"
```

### Log Retention

```yaml
log_retention:
  # Active logs
  hot_storage:
    duration_days: 90
    storage: "primary_database"
    indexed: true

  # Archived logs
  cold_storage:
    duration_years: 7
    storage: "S3/Azure Blob"
    compressed: true
    searchable: true

  # Deletion
  secure_deletion:
    method: "cryptographic_erasure"
    verification: true
```

### Audit Logger Implementation

```python
from app.audit.audit_logger import AuditLogger, AuditEventType

audit = AuditLogger(db)

# Log data access
await audit.log_data_access(
    institution_id="inst-123",
    resource_type="protocol",
    resource_id="proto-456",
    user_id="user-789",
    user_name="Dr. Smith",
    access_type="view",
    contains_phi=True,
    request=request,
)

# Log AI operation
await audit.log_ai_operation(
    institution_id="inst-123",
    operation="extract",
    session_id="session-abc",
    user_id="user-789",
    model_used="claude-3-opus",
    prompt_version="extraction-v2",
)

# Query logs
logs, total = await audit.query_logs(
    institution_id="inst-123",
    event_type="ai_operation",
    start_time=datetime.utcnow() - timedelta(days=7),
    limit=100,
)
```

## Provenance Tracking

The provenance tracking system creates an immutable chain showing how data flows through the system, from input documents through AI processing to final outputs.

### Node Types

| Type | Description | Actor |
|------|-------------|-------|
| input | Original data entering system | User |
| extraction | AI-extracted information | LLM |
| generation | AI-generated content | LLM |
| edit | User modifications | User |
| approval | User sign-off | User |
| review | Review actions | User |

### Recording Provenance

```python
from app.audit.provenance import ProvenanceChain

provenance = ProvenanceChain(db)

# Record document upload
input_id = await provenance.record_input(
    session_id=session_uuid,
    source_type="document",
    data={"filename": "protocol.pdf", "size": 1024000},
    actor=str(user_id),
)

# Record AI extraction
extraction_id = await provenance.record_extraction(
    session_id=session_uuid,
    source_document_id=input_id,
    extracted_data=extracted_fields,
    model_used="claude-3-opus",
    prompt_version="extraction-v2",
    confidence_scores={"title": 0.95, "pi_name": 0.88},
)

# Record AI generation
generation_id = await provenance.record_generation(
    session_id=session_uuid,
    parent_ids=[extraction_id, answers_id],
    generated_content={"section": "methods", "content": "..."},
    model_used="claude-3-opus",
    prompt_version="generation-v1",
)

# Record user edit
edit_id = await provenance.record_user_edit(
    session_id=session_uuid,
    parent_id=generation_id,
    user_id=user_uuid,
    field_changes={"methods": {"old": "...", "new": "..."}},
)

# Get contribution stats
stats = await provenance.get_ai_contribution_percentage(session_id)
# {"ai_percentage": 65.0, "human_percentage": 35.0, ...}
```

## AI Explainability

The explainability service generates human-readable explanations of AI decisions for transparency and regulatory compliance.

### Extraction Explanations

```python
from app.audit.explainability import ExplainabilityService

explainer = ExplainabilityService(db)

explanation = await explainer.explain_extraction(extraction_id)
# Returns ExtractionExplanation with:
# - summary: "The AI analyzed your uploaded protocol document..."
# - source_document: document ID
# - model_used: "claude-3-opus"
# - extracted_fields: list of FieldExplanation
# - low_confidence_warnings: ["Field 'sample_size' has low confidence..."]
```

### Generation Explanations

```python
explanation = await explainer.explain_generation(generation_id)
# Returns GenerationExplanation with:
# - summary: "This content was generated based on..."
# - inputs_used: ["Extracted protocol data", "User answers..."]
# - confidence_level: "high"
# - recommendations: ["Review generated content carefully..."]
```

### Data Flow Visualization

```python
flow = await explainer.get_data_flow(session_id)
# Returns DataFlowExplanation with:
# - total_steps: number of nodes
# - ai_contribution_percentage: 65.0
# - human_contribution_percentage: 35.0
# - data_flow: list of DataFlowNode for visualization
```

## Data Retention Policies

### Retention Periods

| Data Type | Retention Period | Notes |
|-----------|------------------|-------|
| Protocol sessions | 7 years minimum | May be extended per institution |
| Audit logs | 7 years | Regulatory requirement |
| Generated documents | 7 years | Matches protocol retention |
| User accounts | Account lifetime + 7 years | For audit purposes |
| Uploaded documents | 7 years | Unless deleted by user |
| LLM interaction logs | 1 year | Performance and debugging |
| Session tokens | 24 hours | Security measure |

### Retention Configuration

```yaml
data_retention:
  protocol_sessions:
    retention_years: 7
    archive_after_completion_days: 365

  audit_logs:
    retention_years: 7
    archive_after_days: 90

  documents:
    retention_years: 7
    version_retention: "all_versions"

  user_data:
    retention_after_deactivation_years: 7
    anonymization_option: true
```

### Data Deletion

```yaml
data_deletion:
  # Soft delete first
  soft_delete:
    enabled: true
    recovery_period_days: 30

  # Hard delete
  hard_delete:
    requires_approval: true
    audit_logged: true
    secure_method: true

  # Cascading deletion
  cascade:
    session_deletes_messages: true
    user_anonymizes_audit_logs: true
```

## Security Controls

### Authentication

```yaml
authentication:
  password_policy:
    minimum_length: 12
    require_uppercase: true
    require_lowercase: true
    require_number: true
    require_special: true
    no_common_passwords: true
    no_user_info: true
    history_count: 12
    expiry_days: 90

  multi_factor_authentication:
    required: true
    methods:
      - totp
      - sms (deprecated)
      - webauthn

  session_management:
    max_concurrent_sessions: 5
    idle_timeout_minutes: 15
    absolute_timeout_hours: 12
```

### Authorization

```yaml
authorization:
  model: "RBAC with permissions"

  default_roles:
    - researcher
    - reviewer
    - admin
    - super_admin

  permission_checking:
    method: "policy-based"
    deny_by_default: true
```

### Encryption

```yaml
encryption:
  at_rest:
    algorithm: "AES-256-GCM"
    key_management: "AWS KMS / HashiCorp Vault"
    key_rotation: "annual"

  in_transit:
    protocol: "TLS 1.3"
    cipher_suites:
      - TLS_AES_256_GCM_SHA384
      - TLS_CHACHA20_POLY1305_SHA256
    certificate_validation: true
    hsts_enabled: true
```

## Compliance Checklist

### HIPAA Compliance Checklist

- [ ] Designated HIPAA Security Officer
- [ ] Risk assessment completed
- [ ] Security policies documented
- [ ] Workforce training completed
- [ ] Access controls implemented
- [ ] Audit logging enabled
- [ ] Encryption at rest enabled
- [ ] Encryption in transit enabled
- [ ] Business Associate Agreements in place
- [ ] Incident response plan documented
- [ ] Backup and recovery tested
- [ ] Physical safeguards documented (on-prem)

### 21 CFR Part 11 Compliance Checklist

- [ ] System validation completed
- [ ] Audit trail enabled
- [ ] Audit trail immutable
- [ ] Electronic signatures implemented
- [ ] Signature linking verified
- [ ] User identity verification in place
- [ ] Credential management procedures
- [ ] Record retention policy defined
- [ ] Record retrievability verified
- [ ] Standard operating procedures documented

### GDPR Compliance Checklist

- [ ] Privacy policy published
- [ ] Consent mechanisms implemented
- [ ] Data subject rights procedures
- [ ] Data processing records maintained
- [ ] Data Protection Impact Assessment (if required)
- [ ] Data Protection Officer designated (if required)
- [ ] Data transfer mechanisms in place
- [ ] Breach notification procedures
- [ ] Data retention policy defined
- [ ] Right to erasure implemented

## API Reference

### Audit Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/audit/logs` | GET | Query audit logs with filters |
| `/api/audit/logs/user/{user_id}` | GET | Get user activity |
| `/api/audit/logs/resource/{type}/{id}` | GET | Get resource history |
| `/api/audit/sessions/{id}/provenance` | GET | Get session provenance chain |
| `/api/audit/sessions/{id}/contributions` | GET | Get AI/human contribution stats |
| `/api/audit/sessions/{id}/data-flow` | GET | Get data flow visualization |
| `/api/audit/nodes/{id}/lineage` | GET | Get node lineage |
| `/api/audit/nodes/{id}/explain` | GET | Explain a node |
| `/api/audit/extractions/{id}/explain` | GET | Explain extraction |
| `/api/audit/generations/{id}/explain` | GET | Explain generation |
| `/api/audit/compliance/status` | GET | Get compliance status |

### Query Parameters for `/api/audit/logs`

| Parameter | Type | Description |
|-----------|------|-------------|
| `institution_id` | string | Filter by institution UUID |
| `event_type` | string | Filter by event type |
| `actor_id` | string | Filter by user UUID |
| `resource_type` | string | Filter by resource type |
| `resource_id` | string | Filter by resource ID |
| `days` | int | Days to look back (1-365, default: 30) |
| `limit` | int | Max results (1-500, default: 50) |
| `offset` | int | Results to skip (default: 0) |

### Event Types

| Event Type | Description |
|------------|-------------|
| `login` | User authentication |
| `logout` | User logout |
| `login_failed` | Failed authentication |
| `access` | Data access |
| `create` | Resource creation |
| `update` | Resource modification |
| `delete` | Resource deletion |
| `ai_operation` | AI processing |
| `ai_extraction` | Protocol extraction |
| `ai_generation` | Content generation |
| `document_upload` | Document uploaded |
| `document_sign` | Document signed |
| `phi_access` | PHI data accessed |
| `security_alert` | Security event |

---

*This document should be reviewed and updated regularly to ensure continued compliance with evolving regulations.*
