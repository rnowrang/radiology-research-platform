# On-Premises Deployment Guide

This document provides guidance for deploying the Protocol Assistant in on-premises or air-gapped environments.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Air-Gapped Installation](#air-gapped-installation)
- [LLM Proxy Setup](#llm-proxy-setup)
- [Data Residency Configuration](#data-residency-configuration)
- [Local LLM Options](#local-llm-options)
- [Network Configuration](#network-configuration)
- [Backup and Recovery](#backup-and-recovery)
- [Maintenance](#maintenance)

## Overview

On-premises deployment is ideal for organizations that:

- Require complete data control
- Have strict compliance requirements
- Need to operate in air-gapped environments
- Prefer to use local LLM infrastructure

### Deployment Options

| Option | Internet Required | LLM Options |
|--------|-------------------|-------------|
| Standard On-Prem | Yes (for LLM APIs) | Cloud LLM APIs |
| Proxy Mode | Limited (proxy only) | Cloud via proxy |
| Air-Gapped | No | Local LLMs only |

## Prerequisites

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 8 cores | 16+ cores |
| RAM | 16 GB | 32+ GB |
| Storage | 100 GB SSD | 500+ GB SSD |
| Network | 1 Gbps | 10 Gbps |

For local LLM deployment, add:

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| GPU | NVIDIA T4 (16GB) | NVIDIA A100 (40GB) |
| GPU Memory | 16 GB | 40+ GB |
| System RAM | 64 GB | 128+ GB |

### Software Requirements

- Docker 20.10+ and Docker Compose 2.0+
- PostgreSQL 15+ (or Docker)
- Redis 7+ (or Docker)
- SSL certificates for HTTPS
- (Optional) Kubernetes 1.25+ for orchestration

### Network Requirements

| Port | Service | Description |
|------|---------|-------------|
| 443 | HTTPS | Web interface and API |
| 80 | HTTP | Redirect to HTTPS |
| 5432 | PostgreSQL | Database (internal only) |
| 6379 | Redis | Cache (internal only) |

## Air-Gapped Installation

### Step 1: Prepare Installation Bundle

On an internet-connected machine:

```bash
# Create installation directory
mkdir protocol-assistant-bundle
cd protocol-assistant-bundle

# Clone repository
git clone https://github.com/org/radiology-research-platform.git

# Download Docker images
docker pull postgres:15
docker pull redis:7-alpine
docker pull node:18-alpine
docker pull python:3.11-slim

docker save postgres:15 > images/postgres-15.tar
docker save redis:7-alpine > images/redis-7.tar
docker save node:18-alpine > images/node-18.tar
docker save python:3.11-slim > images/python-311.tar

# Download Python dependencies
cd radiology-research-platform/backend
pip download -r requirements.txt -d ../bundle/python-packages/

# Download npm dependencies
cd ../frontend
npm pack $(cat package.json | jq -r '.dependencies | keys[]') --pack-destination ../bundle/npm-packages/

# Create bundle archive
cd ../..
tar -czvf protocol-assistant-bundle.tar.gz protocol-assistant-bundle/
```

### Step 2: Transfer Bundle

Transfer the bundle to the air-gapped environment:

```bash
# Via USB drive, secure file transfer, or data diode
# Verify checksum after transfer
sha256sum protocol-assistant-bundle.tar.gz
```

### Step 3: Install on Air-Gapped System

```bash
# Extract bundle
tar -xzvf protocol-assistant-bundle.tar.gz
cd protocol-assistant-bundle

# Load Docker images
docker load < images/postgres-15.tar
docker load < images/redis-7.tar
docker load < images/node-18.tar
docker load < images/python-311.tar

# Install Python packages from local cache
cd radiology-research-platform/backend
pip install --no-index --find-links=../bundle/python-packages/ -r requirements.txt

# Install npm packages from local cache
cd ../frontend
npm install --offline --cache ../bundle/npm-packages/
```

### Step 4: Build Application

```bash
# Build backend
cd backend
docker build -t protocol-assistant-backend:local -f Dockerfile.prod .

# Build frontend
cd ../frontend
docker build -t protocol-assistant-frontend:local -f Dockerfile.prod .
```

### Step 5: Configure and Start

```bash
# Configure environment
cp env.example .env
# Edit .env with local settings

# Start services
docker-compose -f docker-compose.airgapped.yml up -d
```

### Air-Gapped Docker Compose

```yaml
# docker-compose.airgapped.yml
version: '3.8'

services:
  backend:
    image: protocol-assistant-backend:local
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/protocol_assistant
      - REDIS_URL=redis://redis:6379/0
      - LLM_PROVIDER=local
      - LOCAL_LLM_URL=http://llm:8080
    depends_on:
      - db
      - redis
      - llm

  frontend:
    image: protocol-assistant-frontend:local
    ports:
      - "443:443"
    depends_on:
      - backend

  db:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  llm:
    image: local-llm:latest
    runtime: nvidia
    volumes:
      - llm_models:/models

volumes:
  postgres_data:
  redis_data:
  llm_models:
```

## LLM Proxy Setup

For environments with limited internet access, use a proxy to connect to cloud LLM APIs.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SECURE NETWORK                               │
│                                                                  │
│  ┌────────────────┐       ┌────────────────┐                    │
│  │   Application  │──────▶│   LLM Proxy    │                    │
│  │    Servers     │       │    Server      │                    │
│  └────────────────┘       └───────┬────────┘                    │
│                                   │                              │
└───────────────────────────────────┼──────────────────────────────┘
                                    │ HTTPS (443)
                                    │ (Filtered/Logged)
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET                                  │
│                                                                  │
│      ┌───────────────┐           ┌───────────────┐              │
│      │  Anthropic    │           │    OpenAI     │              │
│      │    API        │           │     API       │              │
│      └───────────────┘           └───────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Proxy Configuration

```yaml
# config/llm-proxy.yaml
proxy:
  listen_address: "0.0.0.0:8443"
  tls:
    cert_file: "/etc/ssl/proxy/cert.pem"
    key_file: "/etc/ssl/proxy/key.pem"

  # Allowed destinations
  allowed_hosts:
    - "api.anthropic.com"
    - "api.openai.com"

  # Request filtering
  filtering:
    # Log all requests
    log_requests: true
    log_responses: false  # Don't log response content

    # Block certain patterns
    block_patterns:
      - ".*password.*"
      - ".*api_key.*"

  # Rate limiting
  rate_limits:
    requests_per_minute: 100
    tokens_per_hour: 1000000

  # Caching (optional, for cost reduction)
  caching:
    enabled: false  # Enable with caution
```

### Nginx Proxy Configuration

```nginx
# /etc/nginx/conf.d/llm-proxy.conf
upstream anthropic {
    server api.anthropic.com:443;
}

upstream openai {
    server api.openai.com:443;
}

server {
    listen 8443 ssl;
    server_name llm-proxy.internal;

    ssl_certificate /etc/ssl/proxy/cert.pem;
    ssl_certificate_key /etc/ssl/proxy/key.pem;

    # Anthropic API proxy
    location /anthropic/ {
        proxy_pass https://anthropic/;
        proxy_ssl_server_name on;
        proxy_set_header Host api.anthropic.com;

        # Logging
        access_log /var/log/nginx/llm-proxy-access.log;
    }

    # OpenAI API proxy
    location /openai/ {
        proxy_pass https://openai/;
        proxy_ssl_server_name on;
        proxy_set_header Host api.openai.com;

        access_log /var/log/nginx/llm-proxy-access.log;
    }
}
```

### Application Configuration for Proxy

```bash
# In .env
LLM_USE_PROXY=true
LLM_PROXY_URL=https://llm-proxy.internal:8443

# Provider base URLs through proxy
ANTHROPIC_BASE_URL=https://llm-proxy.internal:8443/anthropic
OPENAI_BASE_URL=https://llm-proxy.internal:8443/openai
```

## Data Residency Configuration

### Local Storage Configuration

```yaml
# config/storage.yaml
storage:
  type: "local"

  local:
    # Document storage
    documents:
      path: "/data/protocol-assistant/documents"
      max_size_mb: 100

    # Temporary files
    temp:
      path: "/data/protocol-assistant/temp"
      cleanup_hours: 24

    # Backup location
    backups:
      path: "/data/protocol-assistant/backups"
      retention_days: 90
```

### Encryption at Rest

```yaml
# config/encryption.yaml
encryption:
  at_rest:
    enabled: true
    method: "aes-256-gcm"

    # Key management
    key_source: "local"  # or "hsm"

    local:
      key_file: "/etc/protocol-assistant/encryption.key"
      key_rotation_days: 365

    hsm:
      provider: "thales"
      slot: 0
      pin_env: "HSM_PIN"
```

### Database Encryption

```sql
-- Enable PostgreSQL encryption extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encrypt sensitive columns
ALTER TABLE user_integrations
    ALTER COLUMN credentials_encrypted
    SET DATA TYPE BYTEA
    USING pgp_sym_encrypt(credentials_encrypted::text, current_setting('app.encryption_key'));
```

## Local LLM Options

### Supported Local LLM Frameworks

| Framework | Models | GPU Required |
|-----------|--------|--------------|
| Ollama | Llama 2, Mistral, CodeLlama | Recommended |
| vLLM | Any HuggingFace model | Yes |
| Text Generation Inference | Llama, Falcon, etc. | Yes |
| llama.cpp | GGUF format models | Optional |

### Ollama Setup

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull llama2:70b
ollama pull codellama:34b

# Start server
ollama serve
```

### Ollama Configuration

```yaml
# config/llm/ollama.yaml
ollama:
  base_url: "http://localhost:11434"

  models:
    default: "llama2:70b"

    task_mapping:
      protocol_generation: "llama2:70b"
      code_generation: "codellama:34b"
      summarization: "llama2:13b"

  settings:
    num_ctx: 4096
    num_gpu: 1
    num_thread: 8
```

### vLLM Setup

```bash
# Install vLLM
pip install vllm

# Start server
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-2-70b-chat-hf \
    --tensor-parallel-size 4 \
    --port 8080
```

### vLLM Configuration

```yaml
# config/llm/vllm.yaml
vllm:
  base_url: "http://localhost:8080/v1"
  api_key: "local"  # Required but not validated

  models:
    default: "meta-llama/Llama-2-70b-chat-hf"

  settings:
    max_tokens: 4096
    temperature: 0.7
```

### Local LLM Provider Configuration

```bash
# In .env
LLM_PRIMARY_PROVIDER=local
LOCAL_LLM_TYPE=ollama  # or "vllm", "tgi"
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama2:70b
```

### Model Recommendations

| Use Case | Recommended Model | Min GPU Memory |
|----------|-------------------|----------------|
| General Protocol Writing | Llama 2 70B | 40 GB |
| Medical Content | Med-PaLM 2 (if available) | 48 GB |
| Simpler Tasks | Llama 2 13B | 16 GB |
| Code/Technical | CodeLlama 34B | 24 GB |

## Network Configuration

### Firewall Rules

```bash
# Allow HTTPS from internal network
iptables -A INPUT -p tcp --dport 443 -s 10.0.0.0/8 -j ACCEPT

# Allow database from application servers
iptables -A INPUT -p tcp --dport 5432 -s 10.0.1.0/24 -j ACCEPT

# Allow Redis from application servers
iptables -A INPUT -p tcp --dport 6379 -s 10.0.1.0/24 -j ACCEPT

# Drop all other inbound
iptables -A INPUT -j DROP
```

### SSL/TLS Configuration

```bash
# Generate self-signed certificate (for testing)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/protocol-assistant.key \
    -out /etc/ssl/certs/protocol-assistant.crt

# Or use internal CA
openssl req -new -key server.key -out server.csr
# Submit CSR to internal CA
```

### Internal DNS

```
# /etc/hosts or internal DNS
10.0.1.10    protocol-assistant.internal
10.0.1.11    db.protocol-assistant.internal
10.0.1.12    redis.protocol-assistant.internal
10.0.1.13    llm.protocol-assistant.internal
```

## Backup and Recovery

### Automated Backup Script

```bash
#!/bin/bash
# /opt/protocol-assistant/scripts/backup.sh

BACKUP_DIR="/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Database backup
pg_dump -h db.protocol-assistant.internal -U protocol_user protocol_assistant \
    | gzip > "${BACKUP_DIR}/db_${DATE}.sql.gz"

# Document storage backup
tar -czf "${BACKUP_DIR}/documents_${DATE}.tar.gz" /data/protocol-assistant/documents/

# Redis backup (RDB snapshot)
redis-cli -h redis.protocol-assistant.internal BGSAVE
sleep 10
cp /var/lib/redis/dump.rdb "${BACKUP_DIR}/redis_${DATE}.rdb"

# Configuration backup
tar -czf "${BACKUP_DIR}/config_${DATE}.tar.gz" /etc/protocol-assistant/

# Cleanup old backups
find "${BACKUP_DIR}" -type f -mtime +${RETENTION_DAYS} -delete

# Verify backups
if [ -f "${BACKUP_DIR}/db_${DATE}.sql.gz" ]; then
    echo "Backup completed successfully: ${DATE}"
else
    echo "Backup FAILED: ${DATE}"
    exit 1
fi
```

### Backup Schedule

```cron
# /etc/cron.d/protocol-assistant-backup
# Daily backups at 2 AM
0 2 * * * root /opt/protocol-assistant/scripts/backup.sh >> /var/log/backup.log 2>&1

# Weekly full backup on Sunday at 3 AM
0 3 * * 0 root /opt/protocol-assistant/scripts/full-backup.sh >> /var/log/backup.log 2>&1
```

### Recovery Procedure

```bash
#!/bin/bash
# /opt/protocol-assistant/scripts/restore.sh

BACKUP_DATE=$1
BACKUP_DIR="/data/backups"

# Stop services
systemctl stop protocol-assistant

# Restore database
gunzip -c "${BACKUP_DIR}/db_${BACKUP_DATE}.sql.gz" | \
    psql -h db.protocol-assistant.internal -U protocol_user protocol_assistant

# Restore documents
rm -rf /data/protocol-assistant/documents/*
tar -xzf "${BACKUP_DIR}/documents_${BACKUP_DATE}.tar.gz" -C /

# Restore Redis
systemctl stop redis
cp "${BACKUP_DIR}/redis_${BACKUP_DATE}.rdb" /var/lib/redis/dump.rdb
systemctl start redis

# Start services
systemctl start protocol-assistant

# Verify
curl -k https://protocol-assistant.internal/api/v1/health
```

## Maintenance

### Health Monitoring

```yaml
# config/monitoring.yaml
monitoring:
  health_checks:
    - name: "application"
      url: "https://protocol-assistant.internal/api/v1/health"
      interval: 60
      timeout: 10

    - name: "database"
      type: "tcp"
      host: "db.protocol-assistant.internal"
      port: 5432
      interval: 60

    - name: "redis"
      type: "tcp"
      host: "redis.protocol-assistant.internal"
      port: 6379
      interval: 60

    - name: "llm"
      url: "http://llm.protocol-assistant.internal:11434/api/tags"
      interval: 60

  alerting:
    email: "ops@institution.edu"
    on_failure: true
```

### Log Rotation

```
# /etc/logrotate.d/protocol-assistant
/var/log/protocol-assistant/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 protocol-assistant protocol-assistant
    postrotate
        systemctl reload protocol-assistant
    endscript
}
```

### Update Procedure

```bash
#!/bin/bash
# /opt/protocol-assistant/scripts/update.sh

# 1. Create backup
/opt/protocol-assistant/scripts/backup.sh

# 2. Stop services
docker-compose down

# 3. Pull new images (if connected) or load from bundle
docker-compose pull
# OR: docker load < new-images.tar

# 4. Run migrations
docker-compose run --rm backend alembic upgrade head

# 5. Start services
docker-compose up -d

# 6. Verify
sleep 30
curl -k https://protocol-assistant.internal/api/v1/health

# 7. Rollback if needed
# docker-compose down
# /opt/protocol-assistant/scripts/restore.sh <backup_date>
```

---

See also:
- [Deployment Guide](../protocol-assistant/DEPLOYMENT.md)
- [SaaS Deployment](./SAAS_DEPLOYMENT.md)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
- [LLM Configuration](../protocol-assistant/LLM_CONFIGURATION.md)
