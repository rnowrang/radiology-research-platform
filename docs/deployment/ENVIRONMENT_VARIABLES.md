# Environment Variables Reference

This document provides a complete reference for all environment variables used in the Protocol Assistant service.

## Table of Contents

- [Overview](#overview)
- [Application Settings](#application-settings)
- [Database Configuration](#database-configuration)
- [Redis Configuration](#redis-configuration)
- [LLM Provider Configuration](#llm-provider-configuration)
- [Authentication Settings](#authentication-settings)
- [Storage Configuration](#storage-configuration)
- [Feature Flags](#feature-flags)
- [Integration Settings](#integration-settings)
- [Monitoring and Logging](#monitoring-and-logging)
- [Security Settings](#security-settings)
- [Example Configurations](#example-configurations)

## Overview

### Variable Format

Environment variables follow these conventions:
- UPPER_SNAKE_CASE naming
- Prefixed by category when applicable (e.g., `LLM_`, `DB_`)
- Boolean values: `true`, `false`, `1`, `0`
- Lists: comma-separated values

### Configuration Priority

1. Environment variables (highest priority)
2. `.env` file in project root
3. Configuration files in `config/` directory
4. Default values (lowest priority)

### Security Notes

- Never commit `.env` files to version control
- Use secrets management in production
- Rotate sensitive values regularly
- Audit access to configuration

## Application Settings

### Core Application

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_ENV` | No | `development` | Environment: `development`, `staging`, `production` |
| `APP_DEBUG` | No | `false` | Enable debug mode (never in production) |
| `APP_SECRET_KEY` | Yes | - | Secret key for JWT signing (min 32 characters) |
| `APP_NAME` | No | `Protocol Assistant` | Application display name |
| `APP_VERSION` | No | `1.0.0` | Application version |
| `APP_BASE_URL` | No | `http://localhost:8000` | Base URL for the application |

```bash
# Example
APP_ENV=production
APP_DEBUG=false
APP_SECRET_KEY=your-secure-random-string-at-least-32-characters
APP_BASE_URL=https://protocol-assistant.institution.edu
```

### Server Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HOST` | No | `0.0.0.0` | Server bind address |
| `PORT` | No | `8000` | Server port |
| `WORKERS` | No | `4` | Number of worker processes |
| `RELOAD` | No | `false` | Auto-reload on code changes (dev only) |
| `LOG_LEVEL` | No | `INFO` | Logging level: DEBUG, INFO, WARNING, ERROR |

```bash
# Example
HOST=0.0.0.0
PORT=8000
WORKERS=4
LOG_LEVEL=INFO
```

## Database Configuration

### PostgreSQL

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | Full PostgreSQL connection URL |
| `DB_HOST` | Alt | `localhost` | Database host (if not using URL) |
| `DB_PORT` | Alt | `5432` | Database port |
| `DB_NAME` | Alt | `protocol_assistant` | Database name |
| `DB_USER` | Alt | - | Database username |
| `DB_PASSWORD` | Alt | - | Database password |
| `DB_POOL_SIZE` | No | `10` | Connection pool size |
| `DB_MAX_OVERFLOW` | No | `20` | Max overflow connections |
| `DB_POOL_TIMEOUT` | No | `30` | Pool timeout in seconds |
| `DB_ECHO` | No | `false` | Log SQL queries (dev only) |

```bash
# Option 1: Connection URL (recommended)
DATABASE_URL=postgresql://user:password@localhost:5432/protocol_assistant

# Option 2: Individual settings
DB_HOST=localhost
DB_PORT=5432
DB_NAME=protocol_assistant
DB_USER=protocol_user
DB_PASSWORD=secure_password
DB_POOL_SIZE=20
```

## Redis Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | Yes | - | Full Redis connection URL |
| `REDIS_HOST` | Alt | `localhost` | Redis host |
| `REDIS_PORT` | Alt | `6379` | Redis port |
| `REDIS_PASSWORD` | No | - | Redis password |
| `REDIS_DB` | No | `0` | Redis database number |
| `REDIS_MAX_CONNECTIONS` | No | `50` | Max connections |
| `REDIS_SSL` | No | `false` | Use SSL for Redis |

```bash
# Option 1: Connection URL
REDIS_URL=redis://:password@localhost:6379/0

# Option 2: Individual settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
REDIS_DB=0
```

## LLM Provider Configuration

### Provider Selection

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_PRIMARY_PROVIDER` | Yes | `anthropic` | Primary provider: `anthropic`, `openai`, `local` |
| `LLM_FALLBACK_ENABLED` | No | `true` | Enable fallback to secondary provider |
| `LLM_FALLBACK_PROVIDER` | No | `openai` | Fallback provider |
| `LLM_USE_PROXY` | No | `false` | Use proxy for LLM requests |
| `LLM_PROXY_URL` | Cond | - | Proxy URL (required if USE_PROXY=true) |

### Anthropic (Claude)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Cond | - | Anthropic API key |
| `ANTHROPIC_DEFAULT_MODEL` | No | `claude-sonnet-4-20250514` | Default Claude model |
| `ANTHROPIC_MAX_TOKENS` | No | `4096` | Maximum tokens per request |
| `ANTHROPIC_TEMPERATURE` | No | `0.7` | Default temperature |
| `ANTHROPIC_REQUEST_TIMEOUT` | No | `120` | Request timeout in seconds |
| `ANTHROPIC_MAX_RETRIES` | No | `3` | Maximum retry attempts |

```bash
# Anthropic configuration
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=8192
ANTHROPIC_TEMPERATURE=0.7
```

### OpenAI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Cond | - | OpenAI API key |
| `OPENAI_ORG_ID` | No | - | OpenAI organization ID |
| `OPENAI_DEFAULT_MODEL` | No | `gpt-4o` | Default OpenAI model |
| `OPENAI_MAX_TOKENS` | No | `4096` | Maximum tokens per request |
| `OPENAI_TEMPERATURE` | No | `0.7` | Default temperature |
| `OPENAI_REQUEST_TIMEOUT` | No | `120` | Request timeout in seconds |

```bash
# OpenAI configuration
OPENAI_API_KEY=sk-xxxxxxxxxxxxx
OPENAI_ORG_ID=org-xxxxx
OPENAI_DEFAULT_MODEL=gpt-4o
```

### Local LLM

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOCAL_LLM_TYPE` | Cond | - | Local LLM type: `ollama`, `vllm`, `tgi` |
| `LOCAL_LLM_URL` | Cond | - | Local LLM server URL |
| `LOCAL_LLM_MODEL` | Cond | - | Model name/path |
| `LOCAL_LLM_API_KEY` | No | - | API key (if required) |

```bash
# Local LLM configuration
LOCAL_LLM_TYPE=ollama
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama2:70b
```

### Task Routing

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_ROUTE_PROTOCOL_GENERATION` | No | `anthropic:claude-sonnet-4-20250514` | Provider for protocol generation |
| `LLM_ROUTE_COMPLIANCE_CHECK` | No | `anthropic:claude-sonnet-4-20250514` | Provider for compliance checking |
| `LLM_ROUTE_SIMPLE_QA` | No | `anthropic:claude-3-5-haiku-20241022` | Provider for simple Q&A |
| `LLM_ROUTE_SUMMARIZATION` | No | `openai:gpt-4o-mini` | Provider for summarization |

```bash
# Task routing
LLM_ROUTE_PROTOCOL_GENERATION=anthropic:claude-sonnet-4-20250514
LLM_ROUTE_COMPLIANCE_CHECK=anthropic:claude-sonnet-4-20250514
LLM_ROUTE_SIMPLE_QA=openai:gpt-4o-mini
```

## Authentication Settings

### JWT Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET_KEY` | Yes | - | JWT signing secret (use APP_SECRET_KEY if not set) |
| `JWT_ALGORITHM` | No | `HS256` | JWT algorithm |
| `JWT_EXPIRATION_HOURS` | No | `24` | Access token expiration |
| `JWT_REFRESH_EXPIRATION_DAYS` | No | `7` | Refresh token expiration |

### Session Settings

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SESSION_TIMEOUT_HOURS` | No | `12` | Session absolute timeout |
| `SESSION_IDLE_TIMEOUT_MINUTES` | No | `30` | Idle timeout |
| `SESSION_STORE` | No | `redis` | Session storage: `redis`, `database` |

### Password Policy

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PASSWORD_MIN_LENGTH` | No | `12` | Minimum password length |
| `PASSWORD_REQUIRE_UPPER` | No | `true` | Require uppercase letter |
| `PASSWORD_REQUIRE_LOWER` | No | `true` | Require lowercase letter |
| `PASSWORD_REQUIRE_NUMBER` | No | `true` | Require number |
| `PASSWORD_REQUIRE_SPECIAL` | No | `true` | Require special character |
| `PASSWORD_EXPIRY_DAYS` | No | `90` | Password expiration (0 = never) |

```bash
# Authentication settings
JWT_SECRET_KEY=your-jwt-secret-key
JWT_EXPIRATION_HOURS=24
SESSION_TIMEOUT_HOURS=12
PASSWORD_MIN_LENGTH=12
```

## Storage Configuration

### File Storage

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_TYPE` | No | `local` | Storage type: `local`, `s3`, `azure`, `gcs` |
| `STORAGE_PATH` | Cond | `./storage` | Local storage path |
| `STORAGE_MAX_FILE_SIZE_MB` | No | `100` | Maximum file size |

### AWS S3

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_ACCESS_KEY_ID` | Cond | - | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Cond | - | AWS secret key |
| `AWS_REGION` | Cond | `us-east-1` | AWS region |
| `AWS_S3_BUCKET` | Cond | - | S3 bucket name |
| `AWS_S3_PREFIX` | No | - | Object key prefix |

```bash
# S3 storage
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_REGION=us-east-1
AWS_S3_BUCKET=protocol-assistant-documents
```

## Feature Flags

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FEATURE_AI_SUGGESTIONS` | No | `true` | Enable AI suggestions |
| `FEATURE_STREAMING_RESPONSES` | No | `true` | Enable streaming LLM responses |
| `FEATURE_DOCUMENT_VERSIONING` | No | `true` | Enable document versioning |
| `FEATURE_PDF_EXPORT` | No | `true` | Enable PDF export |
| `FEATURE_DOCX_EXPORT` | No | `true` | Enable DOCX export |
| `FEATURE_ZOTERO_INTEGRATION` | No | `true` | Enable Zotero integration |
| `FEATURE_MENDELEY_INTEGRATION` | No | `true` | Enable Mendeley integration |
| `FEATURE_REDCAP_INTEGRATION` | No | `false` | Enable REDCap integration |
| `FEATURE_MULTI_USER_SESSIONS` | No | `true` | Enable multi-user collaboration |
| `FEATURE_ADVANCED_COMPLIANCE` | No | `true` | Enable advanced compliance checking |

```bash
# Feature flags
FEATURE_AI_SUGGESTIONS=true
FEATURE_STREAMING_RESPONSES=true
FEATURE_REDCAP_INTEGRATION=false
```

## Integration Settings

### Zotero

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ZOTERO_ENABLED` | No | `true` | Enable Zotero integration |

### Mendeley

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MENDELEY_ENABLED` | No | `true` | Enable Mendeley integration |
| `MENDELEY_CLIENT_ID` | Cond | - | OAuth client ID |
| `MENDELEY_CLIENT_SECRET` | Cond | - | OAuth client secret |
| `MENDELEY_REDIRECT_URI` | Cond | - | OAuth redirect URI |

### REDCap

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDCAP_ENABLED` | No | `false` | Enable REDCap integration |
| `REDCAP_ALLOWED_DOMAINS` | No | `*.edu,*.gov` | Allowed REDCap domains |

```bash
# Integration settings
MENDELEY_CLIENT_ID=xxxxx
MENDELEY_CLIENT_SECRET=xxxxx
MENDELEY_REDIRECT_URI=https://your-domain.com/api/v1/assistant/integrations/mendeley/callback
```

## Monitoring and Logging

### Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `INFO` | Log level: DEBUG, INFO, WARNING, ERROR |
| `LOG_FORMAT` | No | `json` | Log format: `json`, `text` |
| `LOG_FILE` | No | - | Log file path (stdout if not set) |
| `LOG_MAX_SIZE_MB` | No | `100` | Max log file size |
| `LOG_BACKUP_COUNT` | No | `5` | Number of backup files |

### Sentry

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTRY_DSN` | No | - | Sentry DSN for error tracking |
| `SENTRY_ENVIRONMENT` | No | `production` | Sentry environment tag |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `0.1` | Performance tracing sample rate |

### Prometheus

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROMETHEUS_ENABLED` | No | `true` | Enable Prometheus metrics |
| `PROMETHEUS_PORT` | No | `9090` | Metrics port |

```bash
# Monitoring settings
LOG_LEVEL=INFO
LOG_FORMAT=json
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
PROMETHEUS_ENABLED=true
```

## Security Settings

### CORS

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGINS` | No | `*` | Allowed origins (comma-separated) |
| `CORS_ALLOW_CREDENTIALS` | No | `true` | Allow credentials |
| `CORS_MAX_AGE` | No | `600` | Preflight cache duration |

### Rate Limiting

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | No | `true` | Enable rate limiting |
| `RATE_LIMIT_REQUESTS` | No | `60` | Requests per minute |
| `RATE_LIMIT_GENERATION` | No | `20` | Generation requests per minute |
| `RATE_LIMIT_UPLOAD` | No | `10` | Upload requests per minute |

### Encryption

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ENCRYPTION_KEY` | Cond | - | Data encryption key (32 bytes, base64) |
| `ENCRYPTION_ENABLED` | No | `true` | Enable data encryption |

```bash
# Security settings
CORS_ORIGINS=https://protocol-assistant.institution.edu
RATE_LIMIT_REQUESTS=100
ENCRYPTION_KEY=base64-encoded-32-byte-key
```

## Example Configurations

### Development

```bash
# .env.development
APP_ENV=development
APP_DEBUG=true
APP_SECRET_KEY=dev-secret-key-not-for-production

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/protocol_assistant_dev
REDIS_URL=redis://localhost:6379/0

LLM_PRIMARY_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

LOG_LEVEL=DEBUG
CORS_ORIGINS=http://localhost:3000
```

### Production

```bash
# .env.production
APP_ENV=production
APP_DEBUG=false
APP_SECRET_KEY=${APP_SECRET_KEY}  # From secrets manager
APP_BASE_URL=https://protocol-assistant.institution.edu

DATABASE_URL=${DATABASE_URL}  # From secrets manager
DB_POOL_SIZE=20
DB_MAX_OVERFLOW=30

REDIS_URL=${REDIS_URL}  # From secrets manager
REDIS_SSL=true

LLM_PRIMARY_PROVIDER=anthropic
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}  # From secrets manager
LLM_FALLBACK_ENABLED=true
LLM_FALLBACK_PROVIDER=openai
OPENAI_API_KEY=${OPENAI_API_KEY}  # From secrets manager

STORAGE_TYPE=s3
AWS_S3_BUCKET=protocol-assistant-prod
AWS_REGION=us-east-1

LOG_LEVEL=INFO
LOG_FORMAT=json
SENTRY_DSN=${SENTRY_DSN}

CORS_ORIGINS=https://protocol-assistant.institution.edu
RATE_LIMIT_ENABLED=true
ENCRYPTION_ENABLED=true
```

### Air-Gapped

```bash
# .env.airgapped
APP_ENV=production
APP_DEBUG=false
APP_SECRET_KEY=your-secure-local-secret-key

DATABASE_URL=postgresql://protocol_user:password@db:5432/protocol_assistant
REDIS_URL=redis://redis:6379/0

LLM_PRIMARY_PROVIDER=local
LOCAL_LLM_TYPE=ollama
LOCAL_LLM_URL=http://llm:11434
LOCAL_LLM_MODEL=llama2:70b

STORAGE_TYPE=local
STORAGE_PATH=/data/protocol-assistant/documents

LOG_LEVEL=INFO
PROMETHEUS_ENABLED=true
```

---

See also:
- [Deployment Guide](../protocol-assistant/DEPLOYMENT.md)
- [LLM Configuration](../protocol-assistant/LLM_CONFIGURATION.md)
- [Feature Flags](../protocol-assistant/FEATURE_FLAGS.md)
