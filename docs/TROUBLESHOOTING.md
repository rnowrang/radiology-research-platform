# Troubleshooting Guide

This document provides solutions for common issues encountered in the Radiology Research Platform.

---

## Table of Contents

1. [Form Saving Errors](#form-saving-errors)
2. [Section Collapse Issues](#section-collapse-issues)
3. [Version Conflict Errors](#version-conflict-errors)
4. [Migration Troubleshooting](#migration-troubleshooting)
5. [Protocol Assistant Issues](#protocol-assistant-issues)
6. [General Issues](#general-issues)

---

## Form Saving Errors

### Symptoms

- Form data not persisting after save
- "Save failed" error messages
- Auto-save indicator shows error state
- Data reverts to previous values on page refresh

### Common Causes and Solutions

#### 1. Network Connectivity Issues

**Cause:** The save request cannot reach the server due to network problems.

**Solution:**
- Check your internet connection
- Verify the backend services are running: `docker ps`
- Check browser console for network errors (F12 > Network tab)
- Look for CORS errors if running frontend separately

#### 2. Session Expiration

**Cause:** The user's authentication session has expired.

**Solution:**
- Refresh the page to trigger re-authentication
- Log out and log back in
- Check that JWT tokens are being refreshed properly

#### 3. Server-Side Validation Errors

**Cause:** The form data fails validation on the backend.

**Solution:**
- Check the browser console for detailed error messages
- Review the backend logs: `docker logs radiology-forms`
- Ensure all required fields have valid values

#### 4. Database Connection Issues

**Cause:** The forms service cannot connect to the database.

**Solution:**
- Check database connectivity: `docker exec radiology-db pg_isready`
- Review forms service logs: `docker logs radiology-forms`
- Verify database credentials in environment configuration

### Debugging Steps

1. Open browser developer tools (F12)
2. Go to the Network tab
3. Attempt to save the form
4. Look for the save request (usually POST or PATCH to `/api/forms/{id}/data`)
5. Check the response status code and body for error details

---

## Section Collapse Issues

### Symptoms

- Sections not expanding when clicked
- Sections collapsing unexpectedly during editing
- Section completion indicators showing incorrect status
- All sections collapsed when they should be expanded

### Common Causes and Solutions

#### 1. Incorrect Completion Calculation

**Cause:** The section completion logic is not correctly identifying which fields belong to each section.

**Background:** The form schema uses a flat `schema.fields` array where each field has a `section_id` property. The code must iterate over this flat array rather than looking for nested `section.fields` arrays.

**Solution:**
- Ensure you are using the latest version of the form editor component
- If you see this issue after an update, clear your browser cache (Ctrl+Shift+R)

#### 2. Timer Conflicts

**Cause:** Auto-collapse timers may conflict with user interactions.

**Solution:**
- If sections collapse immediately after you expand them, try clicking more slowly
- Report the issue if it persists - this may indicate a timer cleanup issue

#### 3. State Synchronization Issues

**Cause:** The expanded/collapsed state may become out of sync with the UI.

**Solution:**
- Refresh the page to reset section states
- If the issue persists, try logging out and back in

### Debugging Steps

1. Open browser developer tools (F12)
2. Go to the Console tab
3. Look for any JavaScript errors when clicking section headers
4. Check the React DevTools (if installed) to inspect component state

### Known Issues (Resolved)

- **fieldToSectionMap was empty**: Fixed in January 22, 2026 update. The code now correctly reads from the flat `schema.fields` array using each field's `section_id` property.

---

## Version Conflict Errors

### Symptoms

- Error message: "This form has been modified by another user"
- Error message: "Version conflict - please refresh the page"
- Save fails with HTTP 409 Conflict status
- Data appears to be lost after refresh

### What This Means

The platform uses **optimistic locking** to prevent data loss when multiple users (or browser tabs) edit the same form simultaneously. Each form has a `version` number that increments with every save.

When you save:
1. Your browser sends the version number it last received
2. The server checks if this matches the current version
3. If versions match, the save succeeds and version increments
4. If versions differ, the save is rejected to prevent overwriting someone else's changes

### How to Handle Version Conflicts

#### Step 1: Do Not Close the Page

Your unsaved changes are still in the form. Closing the page will lose them.

#### Step 2: Copy Important Changes

Before refreshing, copy any significant changes you made:
- Select and copy text from text fields
- Take a screenshot of complex selections
- Note which checkboxes/options you changed

#### Step 3: Refresh the Page

Click the refresh button or press F5. This will:
- Load the latest version of the form (with the other user's changes)
- Update your version number to the current one

#### Step 4: Re-apply Your Changes

Carefully re-apply your changes, being mindful of the other user's updates.

### Preventing Conflicts

1. **Coordinate with team members**: Let others know when you're editing a form
2. **Save frequently**: Smaller, more frequent saves reduce conflict scope
3. **Don't leave forms open idle**: Close forms when not actively editing
4. **Use different browsers/tabs carefully**: Each tab maintains its own version state

### For Administrators

To check the current version of a form:
```sql
SELECT id, title, version, updated_at
FROM form_instances
WHERE id = <form_id>;
```

To view recent form saves:
```sql
SELECT fi.id, fi.title, fi.version, fi.updated_at, u.full_name as last_editor
FROM form_instances fi
JOIN users u ON fi.owner_id = u.id
ORDER BY fi.updated_at DESC
LIMIT 10;
```

---

## Migration Troubleshooting

### Common Migration Errors

#### "relation does not exist"

**Cause:** Required SQL migrations have not been applied.

**Solution:**
```bash
# Check which tables exist
docker exec radiology-db psql -U radiology -d radiology_research -c "\dt"

# Apply missing migrations
docker exec radiology-db psql -U radiology -d radiology_research -f /migrations/<missing_migration>.sql
```

#### "column does not exist"

**Cause:** Alembic migrations have not been applied.

**Solution:**
```bash
# Check current Alembic version
docker exec radiology-forms alembic current

# Apply pending migrations
docker exec radiology-forms alembic upgrade head
```

#### "duplicate key value violates unique constraint"

**Cause:** The migration has already been partially applied.

**Solution:**
1. Check the current state of the table
2. Determine which parts of the migration were applied
3. Manually adjust the database or skip the migration

#### Version Column Missing (form_instances)

**Cause:** The `004_add_form_version_column.py` migration has not been applied.

**Symptoms:**
- Error: `column "version" of relation "form_instances" does not exist`
- Form saves fail with database errors

**Solution:**
```bash
# Check current migration status
docker exec radiology-forms alembic current

# Apply the migration
docker exec radiology-forms alembic upgrade head
```

### Checking Migration Status

#### Alembic Migrations
```bash
# Show current revision
docker exec radiology-forms alembic current

# Show all revisions
docker exec radiology-forms alembic history

# Show pending migrations
docker exec radiology-forms alembic history --indicate-current
```

#### SQL Migrations

There is no automatic tracking for raw SQL migrations. Check manually:
```bash
# Check if specific tables/columns exist
docker exec radiology-db psql -U radiology -d radiology_research -c "\d form_instances"
docker exec radiology-db psql -U radiology -d radiology_research -c "\d email_preferences"
```

### Rolling Back Migrations

#### Alembic Rollback
```bash
# Rollback last migration
docker exec radiology-forms alembic downgrade -1

# Rollback to specific revision
docker exec radiology-forms alembic downgrade <revision_id>

# Rollback all migrations
docker exec radiology-forms alembic downgrade base
```

#### SQL Rollback

SQL migrations do not have automatic rollback. Create manual rollback scripts or restore from backup.

---

## Protocol Assistant Issues

The Protocol Assistant is an AI-powered service that helps researchers draft and refine research protocols. This section covers common issues specific to this service.

### 1. "Protocol assistant service unavailable" (503)

**Cause:** The Protocol Assistant container is not running or not accessible.

**Solution:**
- Check if the protocol-assistant container is running: `docker ps`
- Check container logs: `docker logs radiology-protocol-assistant`
- Verify DATABASE_URL format uses `postgresql+asyncpg://` (not `postgresql://`)

### 2. "LLM provider not configured"

**Cause:** No API key is configured for the LLM provider.

**Solution:**
- Ensure `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set in your `.env` file
- Restart the protocol-assistant container after adding keys: `docker restart radiology-protocol-assistant`
- Verify key format:
  - Anthropic keys start with `sk-ant-...`
  - OpenAI keys start with `sk-proj-...`

### 3. "Document upload failed" (404)

**Cause:** Gateway routing is not correctly configured for Protocol Assistant endpoints.

**Solution:**
- Check gateway route ordering in `routes/index.ts`
- Protocol Assistant routes must come before catch-all forms routes
- Verify the `/api/protocol-assistant` prefix is properly configured

### 4. "Session not found" (404)

**Cause:** The session ID is invalid or the session has expired.

**Solution:**
- Verify the session ID is correct
- Check if the session has expired (sessions have a 24-hour limit)
- Ensure the `X-User-ID` header is being passed correctly through the gateway

### 5. Database Migration Errors

**Cause:** Protocol Assistant tables or columns are missing from the database.

**Solution:**
```bash
# Apply Protocol Assistant migrations
docker exec radiology-protocol-assistant alembic upgrade head

# Check for SQLAlchemy metadata column conflicts
docker logs radiology-protocol-assistant | grep -i "metadata"

# Verify DATABASE_URL uses correct port (5432 inside Docker network)
docker exec radiology-protocol-assistant env | grep DATABASE_URL
```

### 6. "Port already in use"

**Cause:** Another service is using the same port as the Protocol Assistant.

**Default Ports:**
| Service | Port |
|---------|------|
| Frontend | 5174 |
| Gateway | 3001 |
| Forms Service | 8001 |
| Protocol Assistant | 8002 |
| Database (host) | 5434 |

**Solution:**
- Check `.env` for port configuration
- Stop conflicting services: `lsof -i :<port>` to find the process
- Adjust port mappings in `docker-compose.yml` if needed

### 7. LLM Rate Limiting

**Cause:** Too many requests to the LLM provider in a short period.

**Symptoms:**
- Responses failing intermittently
- "Rate limit exceeded" errors in logs

**Solution:**
- The service has built-in retry logic with exponential backoff
- Check logs for rate limit messages: `docker logs radiology-protocol-assistant | grep -i "rate"`
- Consider upgrading your API plan for higher limits
- Space out large batch operations

### 8. Streaming Not Working

**Cause:** Server-Sent Events (SSE) are not being properly passed through the gateway.

**Symptoms:**
- Chat responses appear all at once instead of streaming
- Browser console shows connection errors
- Timeout errors during long responses

**Solution:**
- SSE requires proper headers (`Content-Type: text/event-stream`)
- Check browser console for connection errors
- Verify gateway proxy configuration passes through streams correctly
- Ensure no middleware is buffering the response
- Check that the client is using `EventSource` or proper SSE handling

---

## General Issues

### Services Not Starting

**Symptoms:** One or more Docker containers fail to start or exit immediately.

**Debugging:**
```bash
# Check container status
docker ps -a

# View logs for failed container
docker logs <container_name>

# Check Docker Compose status
docker compose ps
```

### Database Connection Errors

**Symptoms:** Backend services cannot connect to PostgreSQL.

**Solutions:**
1. Wait for database to be ready (can take 30+ seconds on first start)
2. Check database credentials in `.env` file
3. Verify database container is healthy: `docker exec radiology-db pg_isready`

### Frontend Not Loading

**Symptoms:** Blank page or "Cannot connect" error in browser.

**Solutions:**
1. Check frontend container is running: `docker ps | grep frontend`
2. Check frontend logs: `docker logs radiology-frontend`
3. Verify port mapping (default: 5174)
4. Clear browser cache

### API Gateway Errors

**Symptoms:** 502 Bad Gateway or 503 Service Unavailable errors.

**Solutions:**
1. Check gateway logs: `docker logs radiology-gateway`
2. Verify forms service is running and healthy
3. Check internal network connectivity between containers

---

*Last Updated: January 23, 2026*
