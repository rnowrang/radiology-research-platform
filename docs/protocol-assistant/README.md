# Protocol Assistant Service

The Protocol Assistant is an AI-powered service that helps researchers prepare Institutional Review Board (IRB) protocols. It provides intelligent guidance, document generation, and compliance checking to streamline the protocol submission process.

## Table of Contents

- [Purpose and Capabilities](#purpose-and-capabilities)
- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Related Documentation](#related-documentation)

## Purpose and Capabilities

### Core Features

The Protocol Assistant provides the following capabilities:

1. **Interactive Protocol Guidance** - Conversational AI that guides researchers through the protocol creation process, asking relevant questions and providing context-aware suggestions.

2. **Document Generation** - Automated generation of protocol sections including:
   - Research objectives and background
   - Study design and methodology
   - Risk-benefit analysis
   - Informed consent documents
   - Data management plans

3. **Compliance Checking** - Real-time validation against:
   - IRB requirements
   - HIPAA regulations
   - 21 CFR Part 11 requirements
   - Institutional policies

4. **Reference Integration** - Import and cite references from:
   - Zotero
   - Mendeley
   - Manual entry

5. **Version Control** - Track changes and maintain history of all protocol revisions.

6. **Collaboration** - Multi-user editing with role-based permissions.

### Use Cases

- **New Protocol Creation** - Start from scratch with AI-guided workflow
- **Protocol Amendment** - Update existing protocols with change tracking
- **Template-Based Generation** - Use institutional templates as starting points
- **Compliance Review** - Pre-submission compliance checking
- **Document Export** - Generate PDF/Word documents for submission

## Architecture Overview

The Protocol Assistant is built as a microservice that integrates with the main Radiology Research Platform. It follows a modular architecture that supports multiple LLM providers and deployment configurations.

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend Application                        │
│                   (React + TypeScript + Vite)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                               │
│                    (Authentication, Routing)                     │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Protocol Assistant Service                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Sessions   │  │  Documents  │  │  Generation Engine      │  │
│  │  Manager    │  │  Manager    │  │  (LLM Orchestration)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Templates  │  │  Compliance │  │  Integration Manager    │  │
│  │  Engine     │  │  Checker    │  │  (Zotero, REDCap, etc)  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │    PostgreSQL     │   │   LLM Providers   │
        │    Database       │   │ (Claude, OpenAI)  │
        └───────────────────┘   └───────────────────┘
```

### Key Design Principles

1. **Provider Agnostic** - Abstract LLM interactions to support multiple providers
2. **Compliance First** - All data handling follows HIPAA and regulatory requirements
3. **Audit Trail** - Complete logging of all operations for compliance
4. **Extensible** - Plugin architecture for new integrations and providers
5. **Multi-tenant** - Support for SaaS and on-premises deployment models

## Quick Start

### Prerequisites

- Docker and Docker Compose
- PostgreSQL 15+
- Node.js 18+ (for development)
- Python 3.11+ (for development)
- API key for at least one LLM provider (Claude or OpenAI)

### Development Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd radiology-research-platform
   ```

2. Copy environment configuration:
   ```bash
   cp env.example .env
   ```

3. Configure LLM provider (see [LLM Configuration](./LLM_CONFIGURATION.md)):
   ```bash
   # In .env file
   LLM_PRIMARY_PROVIDER=anthropic
   ANTHROPIC_API_KEY=your-api-key-here
   ```

4. Start the services:
   ```bash
   docker-compose up -d
   ```

5. Run database migrations:
   ```bash
   docker-compose exec backend alembic upgrade head
   ```

6. Seed initial data (optional):
   ```bash
   docker-compose exec backend python -m scripts.seed
   ```

7. Access the application:
   - Frontend: http://localhost:3000
   - API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

### First Steps

1. Create an admin account through the registration page
2. Configure institution settings in the admin panel
3. Set up feature flags as needed
4. Create a test protocol to verify the installation

## Related Documentation

### Protocol Assistant
- [Architecture Details](./ARCHITECTURE.md) - Detailed system architecture
- [API Reference](./API_REFERENCE.md) - Complete API documentation
- [Database Schema](./DATABASE_SCHEMA.md) - Database structure and relationships
- [LLM Configuration](./LLM_CONFIGURATION.md) - LLM provider setup
- [Feature Flags](./FEATURE_FLAGS.md) - Feature toggle reference
- [Compliance](./COMPLIANCE.md) - Regulatory compliance information
- [Integrations](./INTEGRATIONS.md) - External service integrations
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions

### Deployment
- [Deployment Guide](./DEPLOYMENT.md) - General deployment instructions
- [SaaS Deployment](../deployment/SAAS_DEPLOYMENT.md) - Multi-tenant cloud deployment
- [On-Premises Deployment](../deployment/ON_PREMISES.md) - Self-hosted installation
- [Environment Variables](../deployment/ENVIRONMENT_VARIABLES.md) - Configuration reference

### Development
- [Contributing Guide](../development/CONTRIBUTING.md) - How to contribute
- [Code Style](../development/CODE_STYLE.md) - Coding standards
- [Testing Guide](../development/TESTING.md) - Testing requirements and patterns

## Support

For issues and feature requests, please use the project's issue tracker. For security concerns, contact the security team directly.
