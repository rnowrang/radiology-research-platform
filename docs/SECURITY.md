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

## Contact

For security concerns or vulnerability reports, contact the security team.

**Note**: Never include actual credentials, keys, or sensitive information in documentation or code.

---

*Last Updated: January 15, 2026*
