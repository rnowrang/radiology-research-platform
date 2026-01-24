# SaaS Deployment Guide

This document provides guidance for deploying the Protocol Assistant in a multi-tenant SaaS environment.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Multi-Tenant Configuration](#multi-tenant-configuration)
- [Scaling Considerations](#scaling-considerations)
- [Monitoring Setup](#monitoring-setup)
- [Security Configuration](#security-configuration)
- [Cost Optimization](#cost-optimization)

## Overview

The SaaS deployment model supports multiple institutions sharing a common infrastructure while maintaining data isolation and customization capabilities.

### Key Features

- **Multi-tenancy** - Single deployment serves multiple institutions
- **Data Isolation** - Complete separation of institution data
- **Customization** - Institution-specific settings and branding
- **Scalability** - Horizontal scaling based on demand
- **High Availability** - Redundancy and failover capabilities

### Deployment Options

| Option | Description | Best For |
|--------|-------------|----------|
| Kubernetes | Container orchestration | Production, high scale |
| ECS/Fargate | AWS managed containers | AWS-centric organizations |
| Docker Swarm | Simpler orchestration | Smaller deployments |

## Architecture

### SaaS Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    INTERNET                                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CDN / WAF Layer                                         │
│                        (CloudFlare / AWS CloudFront)                                │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Load Balancer                                           │
│                        (AWS ALB / GCP LB / Nginx)                                   │
│                                                                                      │
│                      ┌─────────────────────────────┐                                │
│                      │   TLS Termination           │                                │
│                      │   Rate Limiting             │                                │
│                      │   Tenant Routing            │                                │
│                      └─────────────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
│   API Instance 1  │       │   API Instance 2  │       │   API Instance N  │
│   (Auto-scaled)   │       │   (Auto-scaled)   │       │   (Auto-scaled)   │
└───────────────────┘       └───────────────────┘       └───────────────────┘
            │                           │                           │
            └───────────────────────────┼───────────────────────────┘
                                        │
            ┌───────────────────────────┼───────────────────────────┐
            ▼                           ▼                           ▼
┌───────────────────┐       ┌───────────────────┐       ┌───────────────────┐
│   Redis Cluster   │       │  PostgreSQL       │       │   Object Storage  │
│   (ElastiCache)   │       │  (RDS Aurora)     │       │   (S3)            │
│                   │       │  Multi-AZ         │       │                   │
└───────────────────┘       └───────────────────┘       └───────────────────┘
                                        │
                                        ▼
                            ┌───────────────────┐
                            │   Read Replicas   │
                            │   (Reporting)     │
                            └───────────────────┘
```

### Component Distribution

| Component | Deployment | Scaling |
|-----------|------------|---------|
| Frontend | CDN + S3 | Static, global |
| API | Kubernetes pods | Horizontal |
| Workers | Kubernetes pods | Horizontal |
| Database | Managed service | Vertical + Replicas |
| Cache | Managed service | Cluster mode |
| Storage | Object storage | Unlimited |

## Multi-Tenant Configuration

### Tenant Identification

Tenants are identified by subdomain or custom domain:

```
# Subdomain-based
institution1.protocol-assistant.com
institution2.protocol-assistant.com

# Custom domain
protocols.university.edu → maps to institution1
```

### Tenant Resolution Middleware

```python
# app/middleware/tenant.py
from fastapi import Request
from app.services.tenant import TenantService

async def resolve_tenant(request: Request):
    """Resolve tenant from request."""
    # Check custom domain mapping
    host = request.headers.get("host", "")
    tenant = await TenantService.get_by_domain(host)

    if tenant:
        return tenant

    # Check subdomain
    subdomain = host.split(".")[0]
    tenant = await TenantService.get_by_subdomain(subdomain)

    if tenant:
        return tenant

    raise TenantNotFoundError(f"Unknown tenant: {host}")
```

### Database Isolation

```yaml
# Multi-tenant database strategy
database:
  strategy: "schema_per_tenant"  # or "row_level_isolation"

  # Schema per tenant (stronger isolation)
  schema_naming: "{tenant_slug}_schema"

  # Row-level isolation (shared tables with tenant_id)
  row_isolation:
    enabled: true
    column: "institution_id"
    enforced: true  # PostgreSQL RLS
```

### Row-Level Security (RLS)

```sql
-- Enable RLS on tables
ALTER TABLE protocol_sessions ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation ON protocol_sessions
    USING (institution_id = current_setting('app.current_tenant')::uuid);

-- Set tenant context per request
SET app.current_tenant = 'inst_123';
```

### Tenant Configuration Storage

```sql
-- Tenant configuration table
CREATE TABLE tenant_configs (
    id UUID PRIMARY KEY,
    institution_id UUID REFERENCES institutions(id),
    config_key VARCHAR(255) NOT NULL,
    config_value JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(institution_id, config_key)
);

-- Example configurations
INSERT INTO tenant_configs (institution_id, config_key, config_value) VALUES
('inst_123', 'branding', '{"logo_url": "...", "primary_color": "#1a73e8"}'),
('inst_123', 'features', '{"ai_suggestions": true, "real_time_collab": false}'),
('inst_123', 'compliance', '{"hipaa_required": true, "21cfr11_required": false}');
```

## Scaling Considerations

### Horizontal Scaling

```yaml
# Kubernetes HPA configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: protocol-assistant-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: protocol-assistant-api
  minReplicas: 3
  maxReplicas: 50
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
```

### Database Scaling

```yaml
# PostgreSQL scaling strategy
database:
  primary:
    instance_type: "db.r6g.xlarge"
    storage_type: "io1"
    iops: 3000

  read_replicas:
    count: 2
    instance_type: "db.r6g.large"
    regions:
      - us-east-1
      - us-west-2

  connection_pooling:
    enabled: true
    pool_size: 100
    max_overflow: 50
```

### Caching Strategy

```yaml
# Redis caching configuration
redis:
  cluster:
    mode: "cluster"
    nodes: 6
    replicas_per_node: 1

  caching:
    tenant_config:
      ttl: 3600  # 1 hour
      prefix: "tenant:{id}:config"

    session_context:
      ttl: 1800  # 30 minutes
      prefix: "session:{id}:context"

    rate_limits:
      ttl: 60
      prefix: "rate:{tenant}:{user}"
```

### Load Balancing

```yaml
# AWS ALB configuration
load_balancer:
  type: "application"
  scheme: "internet-facing"

  listeners:
    - port: 443
      protocol: "HTTPS"
      ssl_policy: "ELBSecurityPolicy-TLS13-1-2-2021-06"

  target_groups:
    api:
      port: 8000
      protocol: "HTTP"
      health_check:
        path: "/health"
        interval: 30
        healthy_threshold: 2
        unhealthy_threshold: 3

  routing:
    # Route by tenant subdomain
    - condition:
        host: "*.protocol-assistant.com"
      action:
        forward: api-target-group
```

## Monitoring Setup

### Metrics Collection

```yaml
# Prometheus metrics configuration
monitoring:
  prometheus:
    enabled: true
    port: 9090
    scrape_interval: 15s

  metrics:
    application:
      - request_duration_seconds
      - request_count
      - error_rate
      - active_sessions

    tenant:
      - sessions_per_tenant
      - llm_usage_per_tenant
      - storage_per_tenant

    infrastructure:
      - cpu_usage
      - memory_usage
      - disk_io
      - network_io
```

### Grafana Dashboards

```yaml
# Key dashboards
dashboards:
  - name: "System Overview"
    panels:
      - request_rate
      - error_rate
      - latency_p99
      - active_users

  - name: "Tenant Health"
    panels:
      - sessions_by_tenant
      - llm_usage_by_tenant
      - error_rate_by_tenant
      - response_time_by_tenant

  - name: "LLM Provider Status"
    panels:
      - provider_latency
      - provider_errors
      - token_usage
      - cost_tracking
```

### Alerting Rules

```yaml
# Alert configuration
alerts:
  - name: "High Error Rate"
    condition: "error_rate > 0.05"
    duration: "5m"
    severity: "critical"
    notify:
      - pagerduty
      - slack

  - name: "LLM Provider Down"
    condition: "llm_health == 0"
    duration: "2m"
    severity: "critical"
    notify:
      - pagerduty

  - name: "High Latency"
    condition: "p99_latency > 5s"
    duration: "10m"
    severity: "warning"
    notify:
      - slack

  - name: "Tenant Quota Exceeded"
    condition: "tenant_usage > tenant_quota * 0.9"
    severity: "warning"
    notify:
      - email_tenant_admin
```

### Logging Strategy

```yaml
# Centralized logging
logging:
  provider: "cloudwatch"  # or "datadog", "splunk"

  log_groups:
    application:
      retention_days: 30
      format: "json"

    audit:
      retention_days: 365
      format: "json"
      encrypted: true

    access:
      retention_days: 90
      format: "clf"

  structured_logging:
    required_fields:
      - timestamp
      - level
      - tenant_id
      - user_id
      - request_id
      - message
```

## Security Configuration

### Network Security

```yaml
# VPC configuration
vpc:
  cidr: "10.0.0.0/16"

  subnets:
    public:
      - cidr: "10.0.1.0/24"
        az: "us-east-1a"
      - cidr: "10.0.2.0/24"
        az: "us-east-1b"

    private:
      - cidr: "10.0.10.0/24"
        az: "us-east-1a"
      - cidr: "10.0.11.0/24"
        az: "us-east-1b"

  security_groups:
    alb:
      ingress:
        - port: 443
          source: "0.0.0.0/0"

    api:
      ingress:
        - port: 8000
          source: "alb_security_group"

    database:
      ingress:
        - port: 5432
          source: "api_security_group"
```

### Secrets Management

```yaml
# AWS Secrets Manager configuration
secrets:
  provider: "aws_secrets_manager"

  secrets:
    - name: "database_credentials"
      rotation:
        enabled: true
        days: 30

    - name: "llm_api_keys"
      rotation:
        enabled: true
        days: 90

    - name: "jwt_secret"
      rotation:
        enabled: true
        days: 90
```

### WAF Rules

```yaml
# AWS WAF configuration
waf:
  rules:
    - name: "rate_limiting"
      priority: 1
      action: "block"
      statement:
        rate_based:
          limit: 2000
          aggregate_key: "IP"

    - name: "sql_injection"
      priority: 2
      action: "block"
      statement:
        managed_rule_group:
          vendor: "AWS"
          name: "AWSManagedRulesSQLiRuleSet"

    - name: "known_bad_inputs"
      priority: 3
      action: "block"
      statement:
        managed_rule_group:
          vendor: "AWS"
          name: "AWSManagedRulesKnownBadInputsRuleSet"
```

## Cost Optimization

### Resource Right-Sizing

```yaml
# Instance sizing recommendations
sizing:
  api:
    small_tenant:
      cpu: "500m"
      memory: "512Mi"

    medium_tenant:
      cpu: "1000m"
      memory: "1Gi"

    large_tenant:
      cpu: "2000m"
      memory: "2Gi"

  database:
    starter: "db.t3.medium"
    growth: "db.r6g.large"
    scale: "db.r6g.xlarge"
```

### Spot Instances

```yaml
# Spot instance configuration for non-critical workloads
spot:
  enabled: true

  workloads:
    - name: "background_workers"
      percentage: 80

    - name: "api_servers"
      percentage: 30  # Keep some on-demand for stability
```

### Cost Allocation

```yaml
# Cost tracking per tenant
cost_tracking:
  enabled: true

  dimensions:
    - tenant_id
    - resource_type
    - region

  metrics:
    - compute_cost
    - storage_cost
    - llm_cost
    - data_transfer_cost

  reporting:
    frequency: "daily"
    format: "csv"
    destination: "s3://billing-reports/"
```

### Reserved Capacity

```yaml
# Reserved instances for predictable workloads
reservations:
  compute:
    - type: "m5.xlarge"
      count: 5
      term: "1_year"

  database:
    - type: "db.r6g.large"
      count: 2
      term: "1_year"
```

---

See also:
- [Deployment Guide](../protocol-assistant/DEPLOYMENT.md)
- [On-Premises Deployment](./ON_PREMISES.md)
- [Environment Variables](./ENVIRONMENT_VARIABLES.md)
