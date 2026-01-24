# Deployment Guide

This guide covers deploying the Protocol Assistant service in various environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Docker Compose Deployment](#docker-compose-deployment)
- [Environment Variables Reference](#environment-variables-reference)
- [Database Setup](#database-setup)
- [First-Time Setup](#first-time-setup)
- [Upgrading](#upgrading)
- [Health Checks](#health-checks)
- [Backup and Recovery](#backup-and-recovery)

## Prerequisites

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Storage | 20 GB | 50+ GB |
| OS | Linux (Ubuntu 20.04+), macOS, Windows (WSL2) | Linux |

### Software Requirements

- Docker 20.10+
- Docker Compose 2.0+
- PostgreSQL 15+ (if not using Docker)
- Redis 7+ (if not using Docker)

### Network Requirements

| Port | Service | Protocol |
|------|---------|----------|
| 80 | HTTP (redirects to HTTPS) | TCP |
| 443 | HTTPS | TCP |
| 5432 | PostgreSQL | TCP |
| 6379 | Redis | TCP |
| 8000 | Backend API (internal) | TCP |
| 3000 | Frontend (internal) | TCP |

### API Keys Required

- At least one LLM provider API key:
  - Anthropic API key, OR
  - OpenAI API key
- (Optional) Integration API keys:
  - Zotero API key
  - REDCap API token

## Docker Compose Deployment

### Development Environment

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd radiology-research-platform
   ```

2. **Configure Environment**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

3. **Start Services**
   ```bash
   docker-compose up -d
   ```

4. **Verify Deployment**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

### Production Environment

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd radiology-research-platform
   ```

2. **Configure Production Environment**
   ```bash
   cp env.example .env.production
   # Edit with production values
   ```

3. **Build Production Images**
   ```bash
   docker-compose -f docker-compose.prod.yml build
   ```

4. **Start Production Services**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Docker Compose File Structure

```yaml
# docker-compose.yml (development)
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/protocol_assistant
      - REDIS_URL=redis://redis:6379/0
    volumes:
      - ./backend:/app
    depends_on:
      - db
      - redis

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - backend

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=protocol_user
      - POSTGRES_PASSWORD=secure_password
      - POSTGRES_DB=protocol_assistant
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Service Scaling

```bash
# Scale backend for more capacity
docker-compose up -d --scale backend=3

# With load balancer in production
docker-compose -f docker-compose.prod.yml up -d --scale backend=5
```

## Environment Variables Reference

### Core Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV` | No | development | Environment: development, staging, production |
| `APP_SECRET_KEY` | Yes | - | Secret key for JWT signing (min 32 chars) |
| `APP_DEBUG` | No | false | Enable debug mode |
| `APP_LOG_LEVEL` | No | INFO | Logging level |

### Database

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `DATABASE_POOL_SIZE` | No | 10 | Connection pool size |
| `DATABASE_MAX_OVERFLOW` | No | 20 | Max overflow connections |

### Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | - | Redis connection string |
| `REDIS_MAX_CONNECTIONS` | No | 50 | Max Redis connections |

### LLM Providers

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PRIMARY_PROVIDER` | Yes | anthropic | Primary LLM provider |
| `ANTHROPIC_API_KEY` | Conditional | - | Anthropic API key |
| `OPENAI_API_KEY` | Conditional | - | OpenAI API key |
| `LLM_FALLBACK_ENABLED` | No | true | Enable fallback |

### Security

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGINS` | No | * | Allowed CORS origins |
| `JWT_EXPIRATION_HOURS` | No | 24 | JWT token expiration |
| `RATE_LIMIT_REQUESTS` | No | 60 | Requests per minute |

### Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_TYPE` | No | local | Storage type: local, s3 |
| `STORAGE_PATH` | No | ./storage | Local storage path |
| `AWS_S3_BUCKET` | Conditional | - | S3 bucket name |
| `AWS_ACCESS_KEY_ID` | Conditional | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Conditional | - | AWS secret key |

See [Environment Variables Reference](../deployment/ENVIRONMENT_VARIABLES.md) for complete list.

## Database Setup

### Initial Setup

1. **Create Database**
   ```bash
   # If using Docker
   docker-compose up -d db

   # If using external PostgreSQL
   createdb -h localhost -U postgres protocol_assistant
   ```

2. **Run Migrations**
   ```bash
   # Using Docker
   docker-compose exec backend alembic upgrade head

   # Local development
   cd backend
   alembic upgrade head
   ```

3. **Seed Initial Data**
   ```bash
   # Using Docker
   docker-compose exec backend python -m scripts.seed

   # Local development
   cd backend
   python -m scripts.seed
   ```

### Database Migrations

```bash
# Create new migration
docker-compose exec backend alembic revision --autogenerate -m "description"

# Apply migrations
docker-compose exec backend alembic upgrade head

# Rollback one migration
docker-compose exec backend alembic downgrade -1

# Show migration history
docker-compose exec backend alembic history
```

### Database Backup

```bash
# Create backup
docker-compose exec db pg_dump -U protocol_user protocol_assistant > backup.sql

# Restore backup
docker-compose exec -T db psql -U protocol_user protocol_assistant < backup.sql
```

## First-Time Setup

### Step 1: Verify Services

```bash
# Check all services are running
docker-compose ps

# Expected output:
# NAME                STATUS              PORTS
# backend             Up                  0.0.0.0:8000->8000/tcp
# frontend            Up                  0.0.0.0:3000->3000/tcp
# db                  Up                  0.0.0.0:5432->5432/tcp
# redis               Up                  0.0.0.0:6379->6379/tcp
```

### Step 2: Run Migrations

```bash
docker-compose exec backend alembic upgrade head
```

### Step 3: Create Admin User

```bash
# Using seed script
docker-compose exec backend python -m scripts.seed --admin-only

# Or via API after starting
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@institution.edu",
    "password": "secure_password",
    "name": "Admin User"
  }'
```

### Step 4: Configure Institution

1. Access the admin panel at `http://localhost:3000/admin`
2. Log in with admin credentials
3. Navigate to Institution Settings
4. Configure:
   - Institution name
   - Contact information
   - Feature flags
   - Templates

### Step 5: Verify LLM Connection

```bash
curl http://localhost:8000/api/v1/assistant/health/llm
```

Expected response:
```json
{
  "status": "healthy",
  "providers": {
    "anthropic": {"status": "connected"}
  }
}
```

### Step 6: Test Protocol Creation

1. Log in as a researcher
2. Create a new protocol session
3. Verify AI responses are working
4. Test document generation

## Upgrading

### Standard Upgrade Process

1. **Backup Database**
   ```bash
   docker-compose exec db pg_dump -U protocol_user protocol_assistant > backup_$(date +%Y%m%d).sql
   ```

2. **Pull Latest Code**
   ```bash
   git pull origin main
   ```

3. **Review Changelog**
   ```bash
   cat CHANGELOG.md
   ```

4. **Update Environment Variables**
   ```bash
   # Check for new required variables
   diff env.example .env
   ```

5. **Rebuild Images**
   ```bash
   docker-compose build --no-cache
   ```

6. **Run Migrations**
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

7. **Restart Services**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

8. **Verify Upgrade**
   ```bash
   curl http://localhost:8000/api/v1/health
   ```

### Zero-Downtime Upgrade

For production environments:

```bash
# Build new images
docker-compose -f docker-compose.prod.yml build

# Rolling update
docker-compose -f docker-compose.prod.yml up -d --no-deps --scale backend=2 backend

# Wait for health checks
sleep 30

# Remove old containers
docker-compose -f docker-compose.prod.yml up -d --no-deps --scale backend=1 backend
```

### Rollback Procedure

If upgrade fails:

1. **Stop Services**
   ```bash
   docker-compose down
   ```

2. **Restore Database**
   ```bash
   docker-compose up -d db
   docker-compose exec -T db psql -U protocol_user protocol_assistant < backup.sql
   ```

3. **Revert Code**
   ```bash
   git checkout <previous-version>
   ```

4. **Rebuild and Start**
   ```bash
   docker-compose build
   docker-compose up -d
   ```

## Health Checks

### Endpoint Overview

| Endpoint | Description |
|----------|-------------|
| `/api/v1/health` | Overall health |
| `/api/v1/health/db` | Database connectivity |
| `/api/v1/health/redis` | Redis connectivity |
| `/api/v1/health/llm` | LLM provider status |

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "components": {
    "database": "healthy",
    "redis": "healthy",
    "llm": "healthy"
  }
}
```

### Docker Health Check Configuration

```yaml
# In docker-compose.yml
backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

## Backup and Recovery

### Automated Backups

```bash
# Create backup script
#!/bin/bash
# backup.sh

BACKUP_DIR=/backups
DATE=$(date +%Y%m%d_%H%M%S)

# Database backup
docker-compose exec -T db pg_dump -U protocol_user protocol_assistant | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Document storage backup
tar -czf $BACKUP_DIR/storage_$DATE.tar.gz ./storage/

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -type f -mtime +7 -delete
```

### Recovery Procedure

1. **Stop Services**
   ```bash
   docker-compose down
   ```

2. **Restore Database**
   ```bash
   docker-compose up -d db
   gunzip -c backup.sql.gz | docker-compose exec -T db psql -U protocol_user protocol_assistant
   ```

3. **Restore Storage**
   ```bash
   tar -xzf storage_backup.tar.gz -C ./
   ```

4. **Start Services**
   ```bash
   docker-compose up -d
   ```

5. **Verify Recovery**
   ```bash
   curl http://localhost:8000/api/v1/health
   ```

---

For deployment-specific guides, see:
- [SaaS Deployment](../deployment/SAAS_DEPLOYMENT.md)
- [On-Premises Deployment](../deployment/ON_PREMISES.md)
- [Environment Variables Reference](../deployment/ENVIRONMENT_VARIABLES.md)
