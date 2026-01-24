# Troubleshooting Guide

This document provides solutions for common issues encountered when running the Protocol Assistant service.

## Table of Contents

- [LLM Provider Issues](#llm-provider-issues)
- [Database Connection Issues](#database-connection-issues)
- [Authentication Problems](#authentication-problems)
- [Rate Limiting](#rate-limiting)
- [Performance Issues](#performance-issues)
- [Integration Issues](#integration-issues)
- [Deployment Issues](#deployment-issues)
- [Resilience and Queue System](#resilience-and-queue-system)
- [Getting Help](#getting-help)

## LLM Provider Issues

### No LLM Providers Available

**Symptoms:**
- Error: "No LLM providers configured"
- Generation requests fail immediately
- Health check shows LLM status as "unavailable"

**Diagnosis:**
```bash
# Check if API keys are set
echo $ANTHROPIC_API_KEY
echo $OPENAI_API_KEY

# Check health endpoint
curl http://localhost:8000/api/v1/assistant/health/llm
```

**Solutions:**

1. Verify API key is set correctly:
   ```bash
   # In .env file
   ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
   # OR
   OPENAI_API_KEY=sk-xxxxx
   ```

2. Restart the service after setting keys:
   ```bash
   docker-compose restart backend
   ```

3. Verify key format matches provider requirements

### Rate Limit Exceeded

**Symptoms:**
- HTTP 429 errors from LLM provider
- Requests timing out
- Error: "Rate limit exceeded, please retry"

**Diagnosis:**
```bash
# Check current rate limit status
curl http://localhost:8000/api/v1/assistant/admin/rate-limits

# Check logs for rate limit warnings
docker-compose logs backend | grep "rate_limit"
```

**Solutions:**

1. Enable fallback provider:
   ```bash
   LLM_FALLBACK_ENABLED=true
   LLM_FALLBACK_PROVIDER=openai
   ```

2. Implement request queuing:
   ```bash
   LLM_REQUEST_QUEUE_ENABLED=true
   LLM_QUEUE_MAX_CONCURRENT=5
   ```

3. Reduce request frequency or batch requests

4. Upgrade API tier with provider

### Provider Timeout

**Symptoms:**
- Requests hang for extended periods
- Error: "Request timed out"
- Slow response times

**Diagnosis:**
```bash
# Test provider connectivity
curl -w "\n%{time_total}s\n" https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
```

**Solutions:**

1. Increase timeout settings:
   ```bash
   ANTHROPIC_REQUEST_TIMEOUT=180
   OPENAI_REQUEST_TIMEOUT=180
   ```

2. Use streaming for long responses:
   ```bash
   LLM_USE_STREAMING=true
   ```

3. Check network connectivity and firewall rules

### Invalid API Key

**Symptoms:**
- HTTP 401 Unauthorized errors
- Error: "Invalid API key"

**Solutions:**

1. Verify key is correct (regenerate if necessary)
2. Check key hasn't been revoked
3. Ensure key has required permissions
4. Verify no extra whitespace in configuration

### Model Not Available

**Symptoms:**
- Error: "Model not found"
- Specific model requests fail

**Solutions:**

1. Check model name is correct:
   ```bash
   ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-20250514  # Correct
   ```

2. Verify your API tier has access to the model

3. Use an available model as fallback

## Database Connection Issues

### Connection Refused

**Symptoms:**
- Error: "Connection refused to database"
- Application fails to start
- Health check shows database as "unhealthy"

**Diagnosis:**
```bash
# Check if PostgreSQL is running
docker-compose ps db

# Test database connectivity
docker-compose exec db pg_isready -U protocol_user

# Check logs
docker-compose logs db
```

**Solutions:**

1. Ensure database container is running:
   ```bash
   docker-compose up -d db
   ```

2. Verify connection string:
   ```bash
   DATABASE_URL=postgresql://protocol_user:password@db:5432/protocol_assistant
   ```

3. Check database logs for errors:
   ```bash
   docker-compose logs db
   ```

4. Verify port is not blocked:
   ```bash
   docker-compose exec backend nc -zv db 5432
   ```

### Connection Pool Exhausted

**Symptoms:**
- Error: "too many connections"
- Intermittent connection failures
- Slow queries

**Diagnosis:**
```bash
# Check active connections
docker-compose exec db psql -U protocol_user -d protocol_assistant -c "SELECT count(*) FROM pg_stat_activity;"
```

**Solutions:**

1. Increase pool size:
   ```bash
   DATABASE_POOL_SIZE=20
   DATABASE_MAX_OVERFLOW=30
   ```

2. Use connection pooler (PgBouncer):
   ```yaml
   # In docker-compose.yml
   pgbouncer:
     image: edoburu/pgbouncer
     environment:
       - DATABASE_URL=postgresql://user:pass@db:5432/protocol_assistant
   ```

3. Optimize query patterns to release connections faster

### Migration Failures

**Symptoms:**
- Error: "migration failed"
- Database schema out of sync
- Missing tables or columns

**Diagnosis:**
```bash
# Check migration history
docker-compose exec backend alembic history

# Check current revision
docker-compose exec backend alembic current
```

**Solutions:**

1. Rollback and retry:
   ```bash
   docker-compose exec backend alembic downgrade -1
   docker-compose exec backend alembic upgrade head
   ```

2. For corrupted state, check alembic_version table:
   ```sql
   SELECT * FROM alembic_version;
   ```

3. Ensure database backup before migrations

## Authentication Problems

### JWT Token Invalid

**Symptoms:**
- HTTP 401 errors
- Error: "Invalid or expired token"
- Users suddenly logged out

**Diagnosis:**
```bash
# Decode JWT token (use jwt.io or command line)
echo "your_token" | cut -d'.' -f2 | base64 -d 2>/dev/null | jq .
```

**Solutions:**

1. Check token expiration:
   ```bash
   JWT_EXPIRATION_HOURS=24  # Increase if needed
   ```

2. Verify secret key hasn't changed:
   ```bash
   APP_SECRET_KEY=consistent_secret_key
   ```

3. Clear browser storage and re-login

### Password Reset Not Working

**Symptoms:**
- Password reset emails not received
- Reset links expired

**Solutions:**

1. Check email configuration:
   ```bash
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_USER=user
   SMTP_PASSWORD=password
   ```

2. Verify reset token expiration:
   ```bash
   PASSWORD_RESET_TOKEN_HOURS=24
   ```

3. Check spam folders

### Session Expired Unexpectedly

**Symptoms:**
- Users logged out during active use
- Error: "Session expired"

**Solutions:**

1. Increase session timeout:
   ```bash
   SESSION_TIMEOUT_HOURS=12
   IDLE_TIMEOUT_MINUTES=30
   ```

2. Enable token refresh:
   ```bash
   JWT_REFRESH_ENABLED=true
   ```

3. Check Redis connectivity (if using for sessions):
   ```bash
   docker-compose exec redis redis-cli ping
   ```

## Rate Limiting

### User Rate Limited

**Symptoms:**
- HTTP 429 Too Many Requests
- Error: "Rate limit exceeded"

**Diagnosis:**
```bash
# Check rate limit headers in response
curl -i http://localhost:8000/api/v1/assistant/sessions

# Look for:
# X-RateLimit-Limit: 60
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 1705319460
```

**Solutions:**

1. Adjust rate limits for legitimate use:
   ```bash
   RATE_LIMIT_REQUESTS=120  # per minute
   RATE_LIMIT_GENERATION=40  # per minute
   ```

2. Implement client-side throttling

3. Use exponential backoff for retries:
   ```python
   import time

   def retry_with_backoff(func, max_retries=3):
       for i in range(max_retries):
           try:
               return func()
           except RateLimitError:
               time.sleep(2 ** i)
       raise Exception("Max retries exceeded")
   ```

### Institution Rate Limited

**Symptoms:**
- All users in institution affected
- Error mentions "institution limit"

**Solutions:**

1. Increase institution limits:
   ```bash
   RATE_LIMIT_INSTITUTION_REQUESTS=1000  # per minute
   ```

2. Contact administrator for limit increase

3. Review usage patterns for optimization

## Performance Issues

### Slow Response Times

**Symptoms:**
- API responses taking > 500ms
- Frontend feels sluggish
- User complaints

**Diagnosis:**
```bash
# Enable request timing logs
LOG_LEVEL=DEBUG

# Check database query times
docker-compose exec db psql -U protocol_user -d protocol_assistant -c "
SELECT query, calls, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;"

# Monitor container resources
docker stats
```

**Solutions:**

1. Add database indexes:
   ```sql
   CREATE INDEX idx_sessions_user_id ON protocol_sessions(user_id);
   CREATE INDEX idx_sessions_status ON protocol_sessions(status);
   ```

2. Enable caching:
   ```bash
   CACHE_ENABLED=true
   CACHE_TTL_SECONDS=300
   ```

3. Optimize queries in service layer

4. Scale horizontally:
   ```bash
   docker-compose up -d --scale backend=3
   ```

### High Memory Usage

**Symptoms:**
- Container OOM kills
- Slow performance over time
- Memory usage continuously increasing

**Diagnosis:**
```bash
# Check container memory
docker stats

# Check for memory leaks
docker-compose exec backend python -c "import tracemalloc; tracemalloc.start()"
```

**Solutions:**

1. Increase container memory limits:
   ```yaml
   backend:
     deploy:
       resources:
         limits:
           memory: 2G
   ```

2. Restart containers periodically (temporary fix)

3. Review code for memory leaks

4. Reduce concurrent connections:
   ```bash
   DATABASE_POOL_SIZE=5
   ```

### High CPU Usage

**Symptoms:**
- Container CPU at 100%
- Slow response times
- Timeouts

**Solutions:**

1. Scale horizontally:
   ```bash
   docker-compose up -d --scale backend=3
   ```

2. Profile and optimize hot code paths

3. Move heavy processing to background tasks:
   ```bash
   CELERY_ENABLED=true
   ```

4. Use appropriate worker count:
   ```bash
   UVICORN_WORKERS=4  # Match CPU cores
   ```

## Integration Issues

### Zotero Connection Failed

**Symptoms:**
- Error: "Failed to connect to Zotero"
- References not syncing

**Solutions:**

1. Verify API key and user ID:
   ```bash
   curl "https://api.zotero.org/users/YOUR_USER_ID/items?key=YOUR_API_KEY&limit=1"
   ```

2. Check for rate limiting (100 requests/minute)

3. Re-authorize connection in settings

### Mendeley OAuth Error

**Symptoms:**
- Error: "OAuth error" or "Invalid redirect URI"

**Solutions:**

1. Verify redirect URI matches exactly:
   ```bash
   MENDELEY_REDIRECT_URI=https://your-domain.com/api/v1/assistant/integrations/mendeley/callback
   ```

2. Check OAuth credentials are correct

3. Ensure HTTPS is used in production

### REDCap API Error

**Symptoms:**
- Error: "REDCap API error"
- Import fails

**Solutions:**

1. Verify API token permissions

2. Check API URL format:
   ```bash
   # Should include trailing slash
   REDCAP_API_URL=https://redcap.institution.edu/api/
   ```

3. Test API connectivity:
   ```bash
   curl -X POST https://redcap.institution.edu/api/ \
     -d "token=YOUR_TOKEN&content=version"
   ```

## Deployment Issues

### Docker Build Fails

**Symptoms:**
- Error during `docker-compose build`
- Missing dependencies

**Solutions:**

1. Clear Docker cache:
   ```bash
   docker-compose build --no-cache
   ```

2. Update base images:
   ```bash
   docker-compose pull
   ```

3. Check for sufficient disk space:
   ```bash
   docker system df
   docker system prune -a  # Warning: removes all unused data
   ```

### Container Won't Start

**Symptoms:**
- Container exits immediately
- Health checks failing

**Diagnosis:**
```bash
# Check container logs
docker-compose logs backend

# Check exit code
docker-compose ps -a
```

**Solutions:**

1. Check for missing environment variables

2. Verify database is accessible

3. Check for port conflicts:
   ```bash
   netstat -tlpn | grep 8000
   ```

4. Fix file permissions:
   ```bash
   chmod -R 755 ./storage
   ```

### HTTPS/SSL Issues

**Symptoms:**
- Certificate errors
- Mixed content warnings

**Solutions:**

1. Verify certificate is valid:
   ```bash
   openssl s_client -connect your-domain.com:443 -servername your-domain.com
   ```

2. Check certificate chain is complete

3. Configure SSL in nginx:
   ```nginx
   ssl_certificate /etc/nginx/ssl/cert.pem;
   ssl_certificate_key /etc/nginx/ssl/key.pem;
   ```

## Resilience and Queue System

This section covers issues related to the task queue, retry logic, and circuit breaker systems.

### Redis Connection Issues

**Symptoms:**
- Tasks not being queued
- Progress updates not saving
- "ConnectionError" in logs

**Diagnosis:**
```bash
# Check if Redis is running
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping
# Expected: PONG

# Check Redis memory usage
docker-compose exec redis redis-cli info memory
```

**Solutions:**

1. **Redis container not starting:**
   ```bash
   docker-compose logs redis
   docker-compose restart redis
   ```

2. **Connection refused:**
   - Verify `REDIS_URL` environment variable is set correctly
   - Check network connectivity between services
   - Ensure Redis port (6379) is not blocked

3. **Memory issues:**
   ```bash
   # Clear Redis cache if needed (WARNING: clears all data)
   docker-compose exec redis redis-cli FLUSHALL
   ```

### Celery Worker Problems

**Symptoms:**
- Tasks stuck in "PENDING" state
- No task processing occurring
- Worker disconnection errors

**Diagnosis:**
```bash
# Check worker status
docker-compose exec celery-worker celery -A app.services.resilience.queue inspect active

# Check registered tasks
docker-compose exec celery-worker celery -A app.services.resilience.queue inspect registered

# View worker logs
docker-compose logs -f celery-worker
```

**Solutions:**

1. **Worker not starting:**
   ```bash
   # Check for import errors
   docker-compose exec protocol-assistant python -c "from app.services.resilience.queue import celery_app; print('OK')"
   docker-compose restart celery-worker
   ```

2. **Worker not processing:**
   - Check for task timeout issues
   - Verify database connection in worker context
   - Check for blocking async operations

3. **Memory issues:**
   ```bash
   # Update worker command in docker-compose.yml:
   command: celery -A app.services.resilience.queue worker --loglevel=info --max-memory-per-child=512000
   ```

### Task Queue Issues

**Symptoms:**
- Tasks not executing
- Duplicate task executions
- Task retries not working

**Diagnosis:**
```bash
# Check queue contents
docker-compose exec redis redis-cli LLEN celery

# Get task result
docker-compose exec protocol-assistant python -c "
from app.services.resilience.queue import get_task_status
print(get_task_status('YOUR_TASK_ID'))
"
```

**Solutions:**

1. **Stuck tasks:**
   ```bash
   # Revoke a specific task
   docker-compose exec celery-worker celery -A app.services.resilience.queue control revoke TASK_ID --terminate

   # Purge all pending tasks (use with caution)
   docker-compose exec celery-worker celery -A app.services.resilience.queue purge
   ```

2. **Retry loop issues:**
   - Check max_retries configuration
   - Verify exception types for retry conditions

### Circuit Breaker States

**Symptoms:**
- Requests failing with "Circuit breaker is open"
- Service calls blocked even when provider recovered

**Circuit Breaker States:**

| State | Description | Behavior |
|-------|-------------|----------|
| CLOSED | Normal operation | All requests pass through |
| OPEN | Too many failures | All requests blocked immediately |
| HALF_OPEN | Testing recovery | Limited requests allowed |

**Solutions:**

1. **Manually reset circuit breaker:**
   ```python
   from app.services.resilience.circuit_breaker import get_circuit_breaker
   cb = get_circuit_breaker("llm_provider")
   cb.reset()
   ```

2. **Adjust thresholds in configuration**

3. **Check underlying service health**

### Progress Tracking Issues

**Symptoms:**
- Progress stuck at 0%
- Progress not updating in real-time
- SSE connection dropping

**Diagnosis:**
```bash
# Check progress in Redis
docker-compose exec redis redis-cli KEYS "progress:*"
docker-compose exec redis redis-cli GET "progress:YOUR_TASK_ID"

# Test SSE endpoint
curl -N http://localhost:8002/api/progress/YOUR_TASK_ID/stream
```

**Solutions:**

1. **Progress not updating:**
   - Ensure task is calling `tracker.update()` regularly
   - Check for exceptions in task execution
   - Verify Redis connectivity from worker

2. **SSE stream dropping:**
   - Check for proxy/load balancer timeouts
   - Increase timeout settings in nginx:
     ```nginx
     proxy_read_timeout 300s;
     proxy_buffering off;
     ```

### Quick Reference Commands

```bash
# Service health
curl http://localhost:8002/health
curl http://localhost:8002/api/progress/health/check

# Redis status
docker-compose exec redis redis-cli INFO

# Celery worker status
docker-compose exec celery-worker celery -A app.services.resilience.queue status

# View all logs
docker-compose logs -f protocol-assistant celery-worker redis

# Clear all queues
docker-compose exec celery-worker celery -A app.services.resilience.queue purge -f
```

## Getting Help

### Before Requesting Help

1. Check this troubleshooting guide
2. Review logs for error messages:
   ```bash
   docker-compose logs --tail=100 backend
   ```
3. Search existing issues in the project repository
4. Verify you're using the latest version

### Gathering Debug Information

When reporting an issue, include:

1. **Version information:**
   ```bash
   curl http://localhost:8000/api/v1/health
   ```

2. **Relevant logs:**
   ```bash
   docker-compose logs --tail=200 backend > backend_logs.txt
   ```

3. **Configuration (redact sensitive values):**
   ```bash
   cat .env | grep -v "KEY\|SECRET\|PASSWORD"
   ```

4. **Steps to reproduce the issue**

5. **Expected vs actual behavior**

### Support Channels

- **GitHub Issues** - For bug reports and feature requests
- **Documentation** - Check the complete documentation
- **Stack Overflow** - Tag with `protocol-assistant`

### Log Locations

| Service | Log Location |
|---------|--------------|
| Backend | `docker-compose logs backend` or `/var/log/protocol-assistant/` |
| Frontend | Browser console or `docker-compose logs frontend` |
| Database | `docker-compose logs db` |
| Redis | `docker-compose logs redis` |
| Nginx | `docker-compose logs nginx` |

### Enabling Debug Mode

For more verbose logging:

```bash
# In .env file
APP_DEBUG=true
LOG_LEVEL=DEBUG
LLM_DEBUG=true
```

**Warning:** Debug mode may log sensitive information. Disable in production.

---

*If you encounter an issue not covered here, please submit a GitHub issue with the debug information listed above.*
