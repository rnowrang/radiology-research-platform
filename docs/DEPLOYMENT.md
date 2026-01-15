# Deployment Guide

This document provides instructions for deploying the Radiology Research Platform in various environments.

---

## Quick Start (Development)

### Prerequisites

- Docker Desktop 4.x+
- Docker Compose 2.x+
- 8GB RAM minimum
- 10GB free disk space

### Steps

1. **Clone the repository**:
   ```bash
   cd /Users/rajamac/dev
   git clone <repository-url> radiology-research-platform
   cd radiology-research-platform
   ```

2. **Create environment file** (optional):
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start all services**:
   ```bash
   docker-compose up -d
   ```

4. **Verify services are running**:
   ```bash
   docker-compose ps
   ```

5. **Access the application**:
   - Frontend: http://localhost:5174
   - Gateway API: http://localhost:3001/api
   - Forms Service API: http://localhost:8001
   - Forms Service Docs: http://localhost:8001/docs

### Default Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@example.com | password123 |
| Reviewer | reviewer@example.com | password123 |
| Researcher | researcher@example.com | password123 |

---

## Service Ports

| Service | Development | Production |
|---------|-------------|------------|
| PostgreSQL | 5434 | Internal only |
| Gateway | 3001 | 443 (via LB) |
| Forms Service | 8001 | Internal only |
| Frontend | 5174 | 443 (via CDN) |

---

## Docker Commands Reference

### Starting Services

```bash
# Start all services
docker-compose up -d

# Start specific service
docker-compose up -d gateway

# Start with build
docker-compose up -d --build

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f forms-service
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v

# Stop specific service
docker-compose stop gateway
```

### Rebuilding

```bash
# Rebuild all images
docker-compose build

# Rebuild specific service
docker-compose build forms-service

# Rebuild without cache
docker-compose build --no-cache
```

### Database Operations

```bash
# Access database CLI
docker exec -it radiology-db psql -U radiology -d radiology_research

# Run SQL file
docker exec -i radiology-db psql -U radiology -d radiology_research < script.sql

# Backup database
docker exec radiology-db pg_dump -U radiology radiology_research > backup.sql

# Restore database
docker exec -i radiology-db psql -U radiology radiology_research < backup.sql
```

---

## Environment Variables

### Required Variables

```bash
# Database
DB_USER=radiology
DB_PASSWORD=secure_password_here
DB_NAME=radiology_research
DB_PORT=5434

# Security
JWT_SECRET=your-very-long-random-secret-key-at-least-32-chars
INTERNAL_API_KEY=internal-service-communication-key

# Service URLs (Docker internal)
FORMS_SERVICE_URL=http://forms-service:8000
GATEWAY_URL=http://gateway:3000

# CORS
CORS_ORIGIN=http://localhost:5174

# Frontend
VITE_API_URL=http://localhost:3001/api
```

### Optional Variables

```bash
# JWT Expiration
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Rate Limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100

# Debug Mode
DEBUG=true
NODE_ENV=development
```

### New Feature Environment Variables

```bash
# Email/Notification Configuration
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=notifications@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=noreply@example.com
SMTP_TLS=true

# File Upload Configuration
MAX_UPLOAD_SIZE=10485760          # 10 MB in bytes
ALLOWED_FILE_TYPES=.pdf,.doc,.docx,.xlsx,.png,.jpg
UPLOAD_SCAN_ENABLED=false         # Enable virus scanning (production)

# Task Approval Workflow
TASK_APPROVAL_NOTIFICATIONS=true
AMENDMENT_DEADLINE_DAYS=7

# Report/Analytics
ANALYTICS_RETENTION_DAYS=365
REPORT_MIN_SAMPLE_SIZE=5
```

---

## Production Deployment

### Infrastructure Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 50 GB SSD | 200 GB SSD |
| Network | 100 Mbps | 1 Gbps |

### Production Architecture

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │    (HTTPS)      │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│    Frontend     │ │    Gateway      │ │  Forms Service  │
│   (CDN/NGINX)   │ │    (x2+)        │ │     (x2+)       │
└─────────────────┘ └────────┬────────┘ └────────┬────────┘
                             │                   │
                             └─────────┬─────────┘
                                       │
                             ┌─────────▼─────────┐
                             │    PostgreSQL     │
                             │  (Primary/Replica)│
                             └───────────────────┘
```

### Production Docker Compose

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  gateway:
    build:
      context: ./gateway
      dockerfile: Dockerfile.prod
    environment:
      NODE_ENV: production
      # ... other env vars
    restart: always
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 512M

  forms-service:
    build:
      context: ./forms-service
      dockerfile: Dockerfile.prod
    environment:
      DEBUG: "false"
      # ... other env vars
    volumes:
      - storage_data:/app/storage
    restart: always
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 1G

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    restart: always

volumes:
  postgres_data:
  storage_data:
```

### Production Checklist

#### Security
- [ ] Change all default passwords
- [ ] Generate strong JWT secret (32+ characters)
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall rules
- [ ] Set up SSL certificates
- [ ] Disable debug mode
- [ ] Remove API documentation endpoints

#### Database
- [ ] Configure database backups
- [ ] Set up replica for high availability
- [ ] Enable connection pooling
- [ ] Configure max connections

#### Monitoring
- [ ] Set up log aggregation
- [ ] Configure health check alerts
- [ ] Set up performance monitoring
- [ ] Configure error tracking

#### Performance
- [ ] Enable gzip compression
- [ ] Configure CDN for static assets
- [ ] Set up Redis caching
- [ ] Configure connection pooling

---

## SSL/TLS Configuration

### Using Let's Encrypt

```bash
# Install certbot
apt-get install certbot

# Generate certificate
certbot certonly --standalone -d api.yourdomain.com

# Certificates will be at:
# /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/api.yourdomain.com/privkey.pem
```

### NGINX SSL Configuration

```nginx
# nginx/nginx.conf
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://gateway:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## Database Migrations

### Running Migrations

```bash
# Enter forms-service container
docker exec -it radiology-forms bash

# Run migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Rollback one migration
alembic downgrade -1
```

### Initial Schema

The database schema is automatically created from `database/schema.sql` when the database container starts for the first time.

To reset the database:
```bash
docker-compose down -v
docker-compose up -d db
```

---

## Backup and Recovery

### Automated Backups

```bash
#!/bin/bash
# scripts/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backups

# Database backup
docker exec radiology-db pg_dump -U radiology radiology_research | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# Storage backup
tar -czf $BACKUP_DIR/storage_$DATE.tar.gz storage/

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete
```

### Recovery

```bash
# Restore database
gunzip -c backup.sql.gz | docker exec -i radiology-db psql -U radiology radiology_research

# Restore storage
tar -xzf storage_backup.tar.gz -C /
```

---

## Scaling

### Horizontal Scaling

```bash
# Scale gateway service
docker-compose up -d --scale gateway=3

# Scale forms service
docker-compose up -d --scale forms-service=2
```

### Load Balancer Configuration

```nginx
upstream gateway {
    least_conn;
    server gateway_1:3000;
    server gateway_2:3000;
    server gateway_3:3000;
}

upstream forms {
    least_conn;
    server forms-service_1:8000;
    server forms-service_2:8000;
}
```

---

## Troubleshooting

### Common Issues

#### Database Connection Failed
```bash
# Check if database is running
docker-compose ps db

# Check database logs
docker-compose logs db

# Verify connection
docker exec radiology-db pg_isready -U radiology
```

#### Forms Service Won't Start
```bash
# Check logs
docker-compose logs forms-service

# Common fix: postgres:// vs postgresql://
# Ensure DATABASE_URL uses postgresql://
```

#### Frontend Can't Connect to API
```bash
# Check CORS settings
# Verify VITE_API_URL matches gateway URL
# Check browser console for errors
```

#### PDF Generation Fails
```bash
# Check LibreOffice is installed
docker exec radiology-forms which soffice

# Check storage permissions
docker exec radiology-forms ls -la /app/storage/generated
```

#### Email Notifications Not Sending
```bash
# Check SMTP configuration
docker-compose exec gateway env | grep SMTP

# Test SMTP connection
docker-compose exec gateway node -e "
  const net = require('net');
  const socket = net.connect(587, 'smtp.example.com', () => {
    console.log('SMTP connection successful');
    socket.end();
  });
"

# Check email logs
docker-compose logs gateway | grep -i email
```

#### File Upload Fails
```bash
# Check upload directory permissions
docker exec radiology-forms ls -la /app/storage/uploads

# Verify max file size configuration
docker-compose exec gateway env | grep MAX_UPLOAD

# Check for disk space
docker exec radiology-forms df -h /app/storage
```

#### Task Approval Workflow Issues
```bash
# Check pending tasks in database
docker exec -it radiology-db psql -U radiology -d radiology_research \
  -c "SELECT id, status, created_at FROM tasks WHERE status = 'pending';"

# Verify admin user permissions
docker exec -it radiology-db psql -U radiology -d radiology_research \
  -c "SELECT id, email, role FROM users WHERE role = 'admin';"
```

#### Analytics/Reports Not Loading
```bash
# Check if recharts data is being generated
docker-compose logs frontend | grep -i analytics

# Verify report endpoints
curl -X GET http://localhost:3001/api/reports/health \
  -H "Authorization: Bearer <admin-token>"
```

### Logs

```bash
# All services
docker-compose logs -f

# Specific service with timestamps
docker-compose logs -f --timestamps gateway

# Last 100 lines
docker-compose logs --tail 100 forms-service
```

---

## Health Checks

### Endpoints

| Service | Endpoint | Expected Response |
|---------|----------|-------------------|
| Gateway | GET /api/health | 200 OK |
| Forms Service | GET / | 200 OK |
| Database | pg_isready | exit 0 |

### Monitoring Script

```bash
#!/bin/bash
# scripts/health_check.sh

check_service() {
    response=$(curl -s -o /dev/null -w "%{http_code}" $1)
    if [ $response -eq 200 ]; then
        echo "$2: OK"
    else
        echo "$2: FAILED ($response)"
        exit 1
    fi
}

check_service "http://localhost:3001/api/health" "Gateway"
check_service "http://localhost:8001/" "Forms Service"

echo "All services healthy"
```

---

## New Service Dependencies

### Email Service (Optional)

For production email notifications, configure an SMTP service:

| Provider | Notes |
|----------|-------|
| AWS SES | Recommended for AWS deployments |
| SendGrid | Good for high-volume sending |
| Mailgun | Developer-friendly API |
| SMTP Server | Self-hosted option |

### File Storage

For production file uploads with large volumes:

| Option | Use Case |
|--------|----------|
| Local Volume | Development, small deployments |
| AWS S3 | Scalable cloud storage |
| MinIO | Self-hosted S3-compatible |

### Redis (Recommended for Production)

For caching analytics data and session management:

```yaml
# Add to docker-compose.prod.yml
redis:
  image: redis:7-alpine
  restart: always
  volumes:
    - redis_data:/data
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

---

## Updated Docker Configuration Notes

### Volume Mounts for New Features

```yaml
# Add to forms-service in docker-compose.yml
volumes:
  - storage_data:/app/storage
  - ./storage/uploads:/app/storage/uploads      # File uploads
  - ./storage/generated:/app/storage/generated  # Generated reports
```

### Health Checks for New Services

```yaml
# Email service health (if using separate container)
healthcheck:
  test: ["CMD", "nc", "-z", "smtp.example.com", "587"]
  interval: 30s
  timeout: 10s
  retries: 3
```

### Resource Limits Update

For deployments with analytics/reporting features:

```yaml
forms-service:
  deploy:
    resources:
      limits:
        memory: 1.5G  # Increased for report generation
      reservations:
        memory: 512M
```

---

*Last Updated: January 15, 2026*
