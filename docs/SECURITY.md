# Security Documentation

This document outlines the security measures, compliance considerations, and best practices implemented in the Radiology Research Platform.

---

## Compliance Overview

### HIPAA Compliance

The platform is designed to support HIPAA (Health Insurance Portability and Accountability Act) compliance for handling Protected Health Information (PHI).

#### Technical Safeguards Implemented

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| Access Control | Role-based access control (RBAC) | Implemented |
| Audit Controls | Comprehensive audit logging | Implemented |
| Integrity Controls | Data validation, checksums | Implemented |
| Transmission Security | HTTPS/TLS (production) | Planned |
| Encryption at Rest | Database encryption | Planned |

#### Administrative Safeguards (Organizational)

| Requirement | Notes |
|-------------|-------|
| Security Officer | Organization must designate |
| Workforce Training | Organization responsibility |
| Access Management | Role assignment documented |
| Security Incident Procedures | Organization must establish |

### SOC 2 Type II Considerations

| Trust Service Criteria | Implementation |
|------------------------|----------------|
| **Security** | Firewalls, rate limiting, auth |
| **Availability** | Health checks, auto-restart |
| **Confidentiality** | Encryption, access controls |
| **Processing Integrity** | Validation, audit trails |
| **Privacy** | Data minimization, consent |

---

## Authentication Security

### Password Security

```
Algorithm: bcrypt
Rounds: 12 (adjustable)
Min Length: 8 characters
Requirements:
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number
```

**Implementation** (Gateway Service):
```typescript
// Password hashing
const SALT_ROUNDS = 12;
const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

// Password verification
const isValid = await bcrypt.compare(password, hashedPassword);
```

### JWT Token Security

| Token Type | Expiration | Storage |
|------------|------------|---------|
| Access Token | 15 minutes | Memory/localStorage |
| Refresh Token | 7 days | localStorage |

**Token Structure**:
```json
{
  "header": {
    "alg": "HS256",
    "typ": "JWT"
  },
  "payload": {
    "userId": "uuid",
    "email": "user@example.com",
    "role": "researcher",
    "iat": 1234567890,
    "exp": 1234568790
  }
}
```

**Security Measures**:
- Tokens signed with HS256 algorithm
- Secret key from environment variable
- Short expiration for access tokens
- Refresh token rotation on use
- Token blacklisting on logout

### Account Lockout

```
Max Failed Attempts: 5
Lockout Duration: 30 minutes
Reset: Automatic after duration
```

**Implementation**:
```typescript
if (user.failed_login_attempts >= 5) {
  if (user.locked_until && user.locked_until > new Date()) {
    throw new Error('Account locked');
  }
}

// On failed login
await db.query(
  'UPDATE users SET failed_login_attempts = failed_login_attempts + 1, locked_until = NOW() + INTERVAL \'30 minutes\' WHERE id = $1',
  [userId]
);
```

---

## Authorization (RBAC)

### Role Hierarchy

```
admin
  ├── All permissions
  ├── User management
  ├── Template management
  └── System configuration

reviewer
  ├── View all forms
  ├── Add comments
  ├── Approve/reject forms
  └── View audit logs (own reviews)

researcher
  ├── Create forms
  ├── Edit own forms
  ├── Submit for review
  └── View own audit logs
```

### Permission Matrix

| Resource | Admin | Reviewer | Researcher |
|----------|-------|----------|------------|
| **Users** |
| List all users | Yes | No | No |
| Create user | Yes | No | No |
| Update any user | Yes | No | No |
| Delete user | Yes | No | No |
| **Templates** |
| List templates | Yes | Yes | Yes |
| Create template | Yes | No | No |
| Update template | Yes | No | No |
| Delete template | Yes | No | No |
| **Forms** |
| List all forms | Yes | Yes | Own only |
| Create form | Yes | Yes | Yes |
| Update any form | Yes | No | Own only |
| Delete any form | Yes | No | Own only |
| **Reviews** |
| View review queue | Yes | Yes | No |
| Approve/reject | Yes | Yes | No |
| **Audit Logs** |
| View all logs | Yes | No | No |
| View own logs | Yes | Yes | Yes |

---

## API Security

### Rate Limiting

```
Window: 15 minutes
Max Requests: 100 per IP
Headers Returned:
  - X-RateLimit-Limit
  - X-RateLimit-Remaining
  - X-RateLimit-Reset
```

**Configuration**:
```typescript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### Security Headers (Helmet.js)

| Header | Value | Purpose |
|--------|-------|---------|
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| X-Frame-Options | DENY | Prevent clickjacking |
| X-XSS-Protection | 1; mode=block | XSS protection |
| Strict-Transport-Security | max-age=31536000 | Force HTTPS |
| Content-Security-Policy | default-src 'self' | Content restrictions |
| Referrer-Policy | strict-origin-when-cross-origin | Referrer control |

### CORS Configuration

```typescript
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
```

### Input Validation

**Gateway (Express Validator)**:
```typescript
const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
];
```

**Forms Service (Pydantic)**:
```python
class FormCreate(BaseModel):
    template_id: int
    title: str = Field(..., min_length=1, max_length=500)
    project_id: Optional[UUID] = None
```

---

## Audit Logging

### What is Logged

| Event Type | Data Captured |
|------------|---------------|
| Authentication | login, logout, failed_login |
| User Actions | create, read, update, delete |
| Form Actions | create, update, submit, approve, reject |
| Document Actions | generate, download |
| Admin Actions | user_create, role_change, template_publish |

### Audit Log Schema

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
  created_at TIMESTAMP DEFAULT NOW()
);

-- Prevent updates/deletes (append-only)
CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

### Log Retention

| Environment | Retention Period |
|-------------|------------------|
| Development | 30 days |
| Production | 7 years (HIPAA) |

---

## Data Protection

### Data Classification

| Level | Examples | Handling |
|-------|----------|----------|
| **Public** | Template names | No restrictions |
| **Internal** | Form schemas | Auth required |
| **Confidential** | Form data, PHI | Encryption, audit |
| **Restricted** | Passwords, keys | Never logged |

### Encryption

#### In Transit
- TLS 1.2+ for all external connections
- Internal Docker network (development)
- mTLS for service-to-service (planned)

#### At Rest
- Database encryption (PostgreSQL TDE - planned)
- File storage encryption (planned)
- Backup encryption (planned)

### Data Sanitization

**Password Handling**:
- Never logged
- Never returned in API responses
- Hashed immediately on receipt

**PHI Handling**:
- Minimized in logs
- Encrypted at rest (planned)
- Access logged

---

## Session Security

### Session Management

```typescript
// Session creation
const session = {
  id: uuid(),
  user_id: user.id,
  session_token: generateSecureToken(),
  refresh_token: generateSecureToken(),
  ip_address: req.ip,
  user_agent: req.headers['user-agent'],
  expires_at: addDays(new Date(), 7),
  is_revoked: false,
};
```

### Session Termination

| Event | Action |
|-------|--------|
| Logout | Revoke session |
| Password change | Revoke all sessions |
| Account lockout | Revoke all sessions |
| Admin action | Can revoke any session |

---

## Service-to-Service Security

### Internal API Key

```
Header: X-Internal-API-Key
Value: Configured via environment variable
```

**Validation** (Forms Service):
```python
def verify_internal_key(request: Request):
    api_key = request.headers.get('X-Internal-API-Key')
    if api_key != settings.internal_api_key:
        raise HTTPException(status_code=401, detail='Invalid API key')
```

### User Context Forwarding

```
Header: X-User-ID
Header: X-User-Role
```

---

## Vulnerability Prevention

### OWASP Top 10 Mitigations

| Vulnerability | Mitigation |
|---------------|------------|
| **Injection** | Parameterized queries, ORM |
| **Broken Auth** | JWT, bcrypt, lockout |
| **Sensitive Data** | Encryption, minimal logging |
| **XXE** | Disabled by default in parsers |
| **Broken Access** | RBAC, ownership checks |
| **Misconfiguration** | Helmet, secure defaults |
| **XSS** | React escaping, CSP |
| **Insecure Deserial** | JSON only, validation |
| **Vuln Components** | Regular updates |
| **Logging/Monitoring** | Comprehensive audit logs |

### SQL Injection Prevention

**Gateway (Parameterized Queries)**:
```typescript
const result = await pool.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);
```

**Forms Service (SQLAlchemy ORM)**:
```python
user = db.query(User).filter(User.email == email).first()
```

### XSS Prevention

- React's automatic escaping
- Content-Security-Policy headers
- Input sanitization

---

## Security Monitoring

### Health Checks

| Service | Endpoint | Interval |
|---------|----------|----------|
| Gateway | /api/health | 30s |
| Forms Service | / | 30s |
| Database | pg_isready | 5s |

### Alerting (Planned)

| Event | Severity | Action |
|-------|----------|--------|
| Multiple failed logins | Medium | Log, notify admin |
| Account lockout | High | Log, notify admin |
| Service down | Critical | Auto-restart, alert |
| Rate limit exceeded | Low | Log |

---

## Incident Response

### Security Incident Categories

| Category | Examples | Response Time |
|----------|----------|---------------|
| Critical | Data breach, system compromise | Immediate |
| High | Successful attack attempt | 1 hour |
| Medium | Failed attack attempt | 24 hours |
| Low | Vulnerability report | 1 week |

### Response Procedures

1. **Identify**: Detect and confirm incident
2. **Contain**: Isolate affected systems
3. **Eradicate**: Remove threat
4. **Recover**: Restore normal operations
5. **Lessons**: Document and improve

---

## Security Checklist

### Development

- [ ] All dependencies up to date
- [ ] No secrets in code
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified
- [ ] XSS prevention verified
- [ ] CSRF protection (if applicable)

### Deployment

- [ ] HTTPS enabled
- [ ] Strong JWT secret
- [ ] Database credentials secured
- [ ] Rate limiting configured
- [ ] Security headers enabled
- [ ] Audit logging enabled

### Operations

- [ ] Regular security audits
- [ ] Penetration testing (annual)
- [ ] Dependency vulnerability scanning
- [ ] Log monitoring
- [ ] Backup verification

---

## Task Approval Workflow Security

### Admin-Only Actions

The task approval workflow implements strict authorization controls to ensure only administrators can approve or reject critical tasks.

| Action | Required Role | Audit Logged |
|--------|---------------|--------------|
| View pending tasks | Admin | Yes |
| Approve task | Admin | Yes |
| Reject task | Admin | Yes |
| Request amendment | Admin, Reviewer | Yes |
| View task history | Admin | Yes |

**Implementation**:
```typescript
// Middleware check for admin-only endpoints
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (req.user.role !== 'admin') {
    auditLog('unauthorized_access_attempt', req.user.id, 'task_approval');
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};
```

### Task State Transitions

```
pending → approved (admin only)
pending → rejected (admin only)
pending → amendment_requested (admin/reviewer)
amendment_requested → pending (researcher resubmit)
```

---

## File Upload Security

### Upload Restrictions

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Max File Size | 10 MB | Prevent DoS attacks |
| Allowed Extensions | .pdf, .doc, .docx, .xlsx, .png, .jpg | Restrict file types |
| MIME Type Validation | Strict | Prevent type spoofing |
| Filename Sanitization | Yes | Prevent path traversal |

### Security Measures

```typescript
// File upload validation
const uploadConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10 MB
  allowedMimeTypes: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
  ],
  sanitizeFilename: true,
  scanForMalware: true // Production only
};
```

### Storage Security

- Files stored outside web root
- Unique UUID-based filenames (original name stored in metadata)
- Access controlled through authenticated API endpoints
- File access logged in audit trail

### Virus Scanning (Production)

```
Scan Engine: ClamAV (planned)
Scan Timing: On upload, before storage
Quarantine: Suspicious files isolated
Notification: Admin alerted on detection
```

---

## Notification Permissions and Privacy

### Notification Types

| Type | Recipients | Contains PHI | Retention |
|------|------------|--------------|-----------|
| Task Assignment | Assigned user | No | 90 days |
| Review Request | Reviewers | No | 90 days |
| Status Change | Form owner | No | 90 days |
| Amendment Request | Form owner | No | 90 days |
| System Alert | Admins | No | 30 days |

### Permission Controls

```typescript
// Notification permission matrix
const notificationPermissions = {
  task_assigned: ['admin', 'reviewer', 'researcher'],
  review_requested: ['admin', 'reviewer'],
  form_approved: ['researcher'],
  form_rejected: ['researcher'],
  amendment_requested: ['researcher'],
  system_alert: ['admin']
};
```

### Privacy Measures

- Notifications contain minimal information (IDs, not content)
- Email notifications use generic subjects (no PHI)
- In-app notifications visible only to intended recipients
- Notification content never includes form data

### Email Notification Security

```
Transport: TLS 1.2+ required
Content: Generic (links back to app)
Headers: No PHI in subject or preview
Unsubscribe: Per notification type
```

---

## Amendment Audit Trail

### What is Tracked

| Event | Data Captured |
|-------|---------------|
| Amendment Requested | Reviewer ID, reason, timestamp, form version |
| Amendment Submitted | Researcher ID, changes summary, timestamp |
| Amendment Reviewed | Reviewer ID, decision, timestamp |
| Version Created | Previous version ID, change diff |

### Audit Log Schema (Amendments)

```sql
-- Amendment-specific audit fields
{
  "action": "amendment_requested",
  "resource_type": "form",
  "resource_id": "uuid",
  "details": {
    "form_version": 3,
    "requested_by": "reviewer-uuid",
    "reason": "Additional documentation required",
    "sections_affected": ["section_2", "section_5"],
    "deadline": "2026-01-20T00:00:00Z"
  }
}
```

### Version History

- All form versions preserved (never overwritten)
- Diff available between any two versions
- Amendment history linked to form lifecycle
- Full chain of custody maintained

---

## Report Access Controls

### Report Types and Permissions

| Report Type | Admin | Reviewer | Researcher |
|-------------|-------|----------|------------|
| System Analytics | Yes | No | No |
| User Activity | Yes | No | No |
| Form Statistics | Yes | Yes | Own only |
| Review Metrics | Yes | Yes | No |
| Audit Reports | Yes | No | No |
| Export Data | Yes | Limited | Own only |

### Data Filtering

```python
# Report data filtering by role
def filter_report_data(user: User, report_type: str, data: list) -> list:
    if user.role == 'admin':
        return data  # Full access
    elif user.role == 'reviewer':
        return [d for d in data if d.get('is_public') or d.get('reviewer_id') == user.id]
    else:  # researcher
        return [d for d in data if d.get('owner_id') == user.id]
```

### Analytics Data Privacy

- Aggregated data only (no individual records)
- Minimum sample size for statistics (n >= 5)
- PHI excluded from all reports
- Export requires admin approval

---

## Email Security

### SMTP Configuration

| Setting | Development | Production |
|---------|-------------|------------|
| Transport | Local/Mailhog | SMTP over TLS |
| Port | 1025 | 587 (TLS) or 465 (SSL) |
| Authentication | None | Required |
| From Address | noreply@localhost | noreply@yourdomain.com |

### Email Security Headers

```
X-Mailer: Not disclosed
X-Priority: Normal (no urgency manipulation)
Reply-To: Configured support address
List-Unsubscribe: Present for marketing emails
```

### Anti-Spoofing (Production)

| Protocol | Status | Purpose |
|----------|--------|---------|
| SPF | Required | Sender verification |
| DKIM | Required | Email signing |
| DMARC | Required | Policy enforcement |

### Email Content Security

- No inline JavaScript
- No tracking pixels with PHI
- Links point to application domain only
- Plain text alternative always provided
- Template injection prevention

### Rate Limiting

```
Per User: 10 emails/hour
Per IP: 50 emails/hour
System Total: 1000 emails/hour
Burst: 5 emails/minute per user
```

---

## LLM and Protocol Assistant Security

This section outlines security measures for the integrated Large Language Model (LLM) features and Protocol Assistant functionality.

---

## LLM Data Handling

### PHI Detection and Prevention

All content is scanned before being sent to external LLM APIs to prevent inadvertent PHI disclosure.

| Check Type | Implementation | Action |
|------------|----------------|--------|
| Pattern Matching | Regex for SSN, MRN, DOB patterns | Block and warn |
| Named Entity Recognition | Detect names, addresses, phone numbers | Redact or block |
| Custom PHI Dictionary | Organization-specific identifiers | Configurable blocking |
| Pre-flight Validation | Validate all prompts before API call | Required |

**Implementation**:
```python
class PHIDetector:
    def scan_content(self, text: str) -> PHIScanResult:
        """Scan text for potential PHI before LLM submission."""
        findings = []

        # Pattern-based detection
        patterns = {
            'ssn': r'\b\d{3}-\d{2}-\d{4}\b',
            'mrn': r'\bMRN[:\s]?\d{6,10}\b',
            'dob': r'\b(DOB|Date of Birth)[:\s]?\d{1,2}/\d{1,2}/\d{4}\b',
            'phone': r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',
        }

        for phi_type, pattern in patterns.items():
            if re.search(pattern, text, re.IGNORECASE):
                findings.append(PHIFinding(type=phi_type, blocked=True))

        return PHIScanResult(has_phi=len(findings) > 0, findings=findings)
```

### Data Minimization

Only the minimum necessary context is sent to LLM APIs.

| Principle | Implementation |
|-----------|----------------|
| Context Limiting | Only relevant sections sent, not entire forms |
| Field Filtering | Exclude sensitive fields from context |
| Summarization | Use summaries instead of full documents when possible |
| Session Isolation | Each request contains only single-task context |

**Configuration**:
```python
LLM_CONTEXT_SETTINGS = {
    'max_context_tokens': 4000,
    'exclude_fields': ['patient_name', 'ssn', 'mrn', 'dob', 'address', 'phone'],
    'include_metadata_only': ['attachments', 'signatures'],
    'summarize_threshold': 2000,  # Summarize sections over this token count
}
```

### No Training Policy

All LLM integrations use APIs configured to not train on user data.

| Provider Requirement | Verification |
|---------------------|--------------|
| API-only access | No web interface data sharing |
| Opt-out of training | Contractual and API-level opt-out |
| Data deletion | 30-day maximum retention by provider |
| Enterprise tier | Business agreements with data protection |

**API Configuration**:
```python
# OpenAI API configuration example
LLM_API_CONFIG = {
    'provider': 'openai',
    'api_version': '2024-01-01',
    'data_retention': 'zero',  # No data retention
    'training_opt_out': True,
    'enterprise_features': True,
}
```

### LLM Interaction Audit Logging

All LLM interactions are logged for compliance and security review.

| Event | Data Captured | Retention |
|-------|---------------|-----------|
| Request Sent | User ID, timestamp, token count, purpose | 7 years |
| Response Received | Response ID, token count, latency | 7 years |
| PHI Blocked | Blocked content hash, PHI type, user notified | 7 years |
| Error | Error type, retry count, resolution | 7 years |

**Audit Log Schema**:
```sql
CREATE TABLE llm_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    session_id UUID NOT NULL,
    request_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    purpose VARCHAR(100) NOT NULL,
    input_token_count INTEGER,
    output_token_count INTEGER,
    model_version VARCHAR(50),
    phi_scan_result JSONB,
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Append-only enforcement
CREATE RULE llm_audit_no_update AS ON UPDATE TO llm_audit_logs DO INSTEAD NOTHING;
CREATE RULE llm_audit_no_delete AS ON DELETE TO llm_audit_logs DO INSTEAD NOTHING;
```

---

## Credential Storage

### User API Key Encryption

User-provided API keys (e.g., for external LLM services) are encrypted at rest using Fernet symmetric encryption (AES-128-CBC with HMAC).

| Security Measure | Implementation |
|-----------------|----------------|
| Encryption Algorithm | Fernet (AES-128-CBC + HMAC-SHA256) |
| Key Derivation | PBKDF2 with 480,000 iterations |
| Master Key Storage | Environment variable (never in code) |
| Key Rotation | Supported via re-encryption |

**Implementation**:
```python
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import os

class CredentialManager:
    def __init__(self):
        master_key = os.environ.get('CREDENTIAL_ENCRYPTION_KEY')
        if not master_key:
            raise SecurityError('Master encryption key not configured')
        self.fernet = Fernet(master_key.encode())

    def encrypt_api_key(self, api_key: str) -> bytes:
        """Encrypt user API key for storage."""
        return self.fernet.encrypt(api_key.encode())

    def decrypt_api_key(self, encrypted_key: bytes) -> str:
        """Decrypt user API key for use."""
        return self.fernet.decrypt(encrypted_key).decode()
```

### Credential Storage Schema

```sql
CREATE TABLE user_credentials (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    credential_type VARCHAR(50) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    encrypted_key BYTEA NOT NULL,
    key_prefix VARCHAR(10),  -- First few chars for identification (e.g., "sk-abc...")
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(user_id, credential_type, provider)
);

-- Index for quick lookups
CREATE INDEX idx_user_credentials_user_provider ON user_credentials(user_id, provider);
```

### API Key Security Requirements

| Requirement | Enforcement |
|-------------|-------------|
| Never logged | API keys excluded from all logs |
| Never in responses | Keys never returned after initial storage |
| Masked display | Show only prefix (e.g., "sk-abc...xyz") |
| Secure deletion | Keys overwritten before deletion |
| Access logging | All key usage logged (without key value) |

**Security Controls**:
```python
# Logging sanitization
SENSITIVE_FIELD_PATTERNS = [
    r'api[_-]?key',
    r'secret',
    r'password',
    r'token',
    r'credential',
]

def sanitize_log_data(data: dict) -> dict:
    """Remove sensitive fields from log data."""
    sanitized = {}
    for key, value in data.items():
        if any(re.search(pattern, key, re.IGNORECASE) for pattern in SENSITIVE_FIELD_PATTERNS):
            sanitized[key] = '[REDACTED]'
        else:
            sanitized[key] = value
    return sanitized
```

---

## HIPAA Compliance for AI Features

### Business Associate Agreement (BAA) Requirements

| LLM Provider Requirement | Status | Notes |
|-------------------------|--------|-------|
| BAA Available | Required | Must have signed BAA before use |
| HIPAA-eligible Service | Required | Provider must offer HIPAA-compliant tier |
| Data Processing Addendum | Required | EU/international data handling |
| Subprocessor List | Required | Transparency on data handling chain |

**Verification Checklist**:
- [ ] BAA signed with LLM provider
- [ ] Provider SOC 2 Type II report reviewed
- [ ] Data processing locations documented
- [ ] Subprocessor notification process established
- [ ] Breach notification procedures agreed

### Data Residency Considerations

| Requirement | Implementation |
|-------------|----------------|
| US Data Residency | Configure API endpoints to US regions only |
| No Cross-Border Transfer | Block requests if residency cannot be guaranteed |
| Region Verification | Validate provider data center locations |
| Contractual Guarantee | Written confirmation of data residency |

**Configuration**:
```python
LLM_DATA_RESIDENCY = {
    'required_regions': ['us-east-1', 'us-west-2'],
    'blocked_regions': ['eu-*', 'ap-*'],
    'verify_on_request': True,
    'fail_closed': True,  # Block if residency cannot be verified
}
```

### Access Controls and Audit Trails

| Control | Implementation |
|---------|----------------|
| Role-Based Access | Only authorized roles can use LLM features |
| Per-User Permissions | Granular LLM feature access |
| Usage Quotas | Configurable limits per user/role |
| Full Audit Trail | All interactions logged with user context |

**Permission Matrix**:

| LLM Feature | Admin | Reviewer | Researcher |
|-------------|-------|----------|------------|
| Protocol Assistant | Yes | Yes | Yes |
| Form Auto-fill | Yes | Yes | Yes |
| Bulk Processing | Yes | No | No |
| Custom Prompts | Yes | Yes | No |
| API Key Management | Yes | No | Self only |

### Right to Erasure Support

| GDPR/CCPA Requirement | Implementation |
|----------------------|----------------|
| User Data Deletion | All LLM interaction logs deletable |
| Provider Data Deletion | Automated deletion requests to provider |
| Verification | Confirmation of deletion from all systems |
| Timeline | 30 days maximum for complete erasure |

**Erasure Process**:
```python
async def process_erasure_request(user_id: UUID) -> ErasureResult:
    """Process right to erasure request for LLM data."""
    results = []

    # 1. Delete local LLM audit logs
    await db.execute(
        "DELETE FROM llm_audit_logs WHERE user_id = $1",
        user_id
    )
    results.append(ErasureStep('local_logs', 'completed'))

    # 2. Request deletion from LLM provider
    provider_result = await llm_provider.request_data_deletion(user_id)
    results.append(ErasureStep('provider_data', provider_result.status))

    # 3. Delete cached sessions
    await session_cache.delete_user_sessions(user_id)
    results.append(ErasureStep('session_cache', 'completed'))

    return ErasureResult(user_id=user_id, steps=results)
```

---

## LLM Security Best Practices

### Prompt Injection Prevention

| Attack Vector | Mitigation |
|--------------|------------|
| Direct Injection | Input sanitization and validation |
| Indirect Injection | Context isolation and filtering |
| Jailbreak Attempts | Pattern detection and blocking |
| Role Manipulation | System prompt protection |

**Implementation**:
```python
class PromptSecurityValidator:
    INJECTION_PATTERNS = [
        r'ignore\s+(previous|above|all)\s+instructions',
        r'disregard\s+(your|the)\s+(rules|instructions)',
        r'you\s+are\s+now\s+[a-zA-Z]+',
        r'pretend\s+(to\s+be|you\'re)',
        r'system:\s*',
        r'\[INST\]',
        r'<\|im_start\|>',
    ]

    def validate_input(self, user_input: str) -> ValidationResult:
        """Check for potential prompt injection attempts."""
        for pattern in self.INJECTION_PATTERNS:
            if re.search(pattern, user_input, re.IGNORECASE):
                return ValidationResult(
                    valid=False,
                    reason='Potential prompt injection detected',
                    blocked_pattern=pattern
                )
        return ValidationResult(valid=True)

    def sanitize_input(self, user_input: str) -> str:
        """Sanitize user input before including in prompt."""
        # Escape special characters
        sanitized = user_input.replace('{', '{{').replace('}', '}}')
        # Remove control characters
        sanitized = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', sanitized)
        return sanitized
```

### Output Validation

| Validation Type | Purpose |
|----------------|---------|
| Content Filtering | Remove inappropriate or harmful content |
| PHI Re-check | Scan output for any PHI that may have been generated |
| Format Validation | Ensure output matches expected structure |
| Hallucination Detection | Flag potentially fabricated information |

**Implementation**:
```python
class OutputValidator:
    def validate_response(self, response: str, expected_format: str) -> ValidationResult:
        """Validate LLM response before returning to user."""
        issues = []

        # Check for PHI in output
        phi_scan = self.phi_detector.scan_content(response)
        if phi_scan.has_phi:
            issues.append('PHI detected in output')
            response = self.redact_phi(response, phi_scan.findings)

        # Check for harmful content
        if self.content_filter.is_harmful(response):
            issues.append('Harmful content detected')
            return ValidationResult(valid=False, issues=issues)

        # Validate format if specified
        if expected_format and not self.matches_format(response, expected_format):
            issues.append('Output format mismatch')

        return ValidationResult(
            valid=len(issues) == 0,
            issues=issues,
            sanitized_response=response
        )
```

### Rate Limiting for LLM Endpoints

| Limit Type | Value | Window |
|------------|-------|--------|
| Requests per user | 100 | 1 hour |
| Requests per IP | 200 | 1 hour |
| Tokens per user | 100,000 | 24 hours |
| Concurrent requests | 5 | Per user |

**Configuration**:
```python
LLM_RATE_LIMITS = {
    'requests_per_user_per_hour': 100,
    'requests_per_ip_per_hour': 200,
    'tokens_per_user_per_day': 100_000,
    'max_concurrent_requests': 5,
    'burst_limit': 10,
    'burst_window_seconds': 60,
}
```

### Token Limits per Request

| Limit | Value | Purpose |
|-------|-------|---------|
| Max Input Tokens | 4,000 | Prevent excessive context |
| Max Output Tokens | 2,000 | Limit response size |
| Total Request Tokens | 6,000 | Cost control |
| System Prompt Tokens | 500 | Reserved for system context |

**Enforcement**:
```python
def validate_token_limits(request: LLMRequest) -> None:
    """Enforce token limits before sending request."""
    input_tokens = count_tokens(request.prompt)

    if input_tokens > LLM_LIMITS['max_input_tokens']:
        raise TokenLimitExceeded(
            f'Input exceeds {LLM_LIMITS["max_input_tokens"]} token limit'
        )

    if request.max_output_tokens > LLM_LIMITS['max_output_tokens']:
        request.max_output_tokens = LLM_LIMITS['max_output_tokens']
```

---

## LLM Session Security

### Session Expiration

| Session Type | Expiration | Extension |
|--------------|------------|-----------|
| Protocol Assistant Session | 24 hours | Not extendable |
| Conversation Context | 2 hours of inactivity | Resets on activity |
| Cached Responses | 1 hour | Automatic refresh |

**Implementation**:
```python
SESSION_CONFIG = {
    'max_session_duration': timedelta(hours=24),
    'inactivity_timeout': timedelta(hours=2),
    'cache_ttl': timedelta(hours=1),
    'cleanup_interval': timedelta(minutes=15),
}

class SessionManager:
    async def validate_session(self, session_id: UUID) -> bool:
        """Check if session is still valid."""
        session = await self.get_session(session_id)
        if not session:
            return False

        # Check absolute expiration
        if datetime.utcnow() > session.created_at + SESSION_CONFIG['max_session_duration']:
            await self.terminate_session(session_id)
            return False

        # Check inactivity timeout
        if datetime.utcnow() > session.last_activity + SESSION_CONFIG['inactivity_timeout']:
            await self.terminate_session(session_id)
            return False

        return True
```

### User Isolation

Users can only access their own LLM sessions and conversation history.

| Isolation Control | Implementation |
|-------------------|----------------|
| Session Ownership | Sessions bound to user ID |
| Query Filtering | All queries include user ID filter |
| Cross-User Prevention | Strict validation on all session access |
| Admin Override | Audit-logged admin access for support |

**Database Constraints**:
```sql
-- Session table with user isolation
CREATE TABLE llm_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(50) NOT NULL,
    context JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT true
);

-- Row-level security for user isolation
ALTER TABLE llm_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY llm_sessions_user_isolation ON llm_sessions
    FOR ALL
    USING (user_id = current_user_id());
```

**Access Validation**:
```python
async def get_session(self, session_id: UUID, user_id: UUID) -> Optional[LLMSession]:
    """Get session with user isolation enforcement."""
    session = await db.fetchone(
        """
        SELECT * FROM llm_sessions
        WHERE id = $1 AND user_id = $2 AND is_active = true
        """,
        session_id, user_id
    )

    if not session:
        audit_log('session_access_denied', user_id, session_id)
        return None

    return LLMSession(**session)
```

### Session Data Encryption at Rest

| Data Type | Encryption | Key Management |
|-----------|------------|----------------|
| Conversation History | AES-256-GCM | Per-session key |
| User Context | AES-256-GCM | Per-user key |
| Cached Responses | AES-256-GCM | Rotating keys |

**Implementation**:
```python
class SessionEncryption:
    def __init__(self):
        self.master_key = os.environ.get('SESSION_ENCRYPTION_KEY')

    def encrypt_session_data(self, session_id: UUID, data: dict) -> bytes:
        """Encrypt session data with session-specific key."""
        session_key = self.derive_session_key(session_id)
        cipher = AESGCM(session_key)
        nonce = os.urandom(12)
        plaintext = json.dumps(data).encode()
        ciphertext = cipher.encrypt(nonce, plaintext, None)
        return nonce + ciphertext

    def derive_session_key(self, session_id: UUID) -> bytes:
        """Derive session-specific encryption key."""
        kdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=session_id.bytes,
            info=b'session_encryption'
        )
        return kdf.derive(self.master_key.encode())
```

---

## Contact

For security concerns or vulnerability reports, contact the security team.

**Note**: Never include actual credentials, keys, or sensitive information in documentation or code.

---

*Last Updated: January 15, 2026*
