# Protocol Assistant Architecture

This document provides a detailed overview of the Protocol Assistant's architecture, including system diagrams, data flows, and component responsibilities.

## Table of Contents

- [System Architecture](#system-architecture)
- [Component Overview](#component-overview)
- [Data Flow](#data-flow)
- [Service Communication](#service-communication)
- [LLM Provider Abstraction](#llm-provider-abstraction)
- [Security Architecture](#security-architecture)
- [Scalability Considerations](#scalability-considerations)

## System Architecture

### Complete System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENTS                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                      │
│  │   Web Browser   │  │   Mobile App    │  │   API Client    │                      │
│  │   (React SPA)   │  │   (Future)      │  │   (Integrations)│                      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                      │
└───────────┼─────────────────────┼─────────────────────┼──────────────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │ HTTPS
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              LOAD BALANCER / NGINX                                   │
│                          (TLS Termination, Rate Limiting)                           │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              APPLICATION LAYER                                       │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                            API GATEWAY SERVICE                                │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │    Auth      │  │    Rate      │  │   Request    │  │    Response      │  │  │
│  │  │  Middleware  │  │   Limiter    │  │   Router     │  │    Transformer   │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                           │
│            ┌────────────────────────────┼────────────────────────────┐              │
│            │                            │                            │              │
│            ▼                            ▼                            ▼              │
│  ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐          │
│  │  FORMS SERVICE   │      │ PROTOCOL ASSIST  │      │  REVIEW SERVICE  │          │
│  │                  │      │    SERVICE       │      │                  │          │
│  │  - Form CRUD     │      │  - Sessions      │      │  - Submissions   │          │
│  │  - Validation    │      │  - Generation    │      │  - Approvals     │          │
│  │  - Templates     │      │  - Documents     │      │  - Comments      │          │
│  └──────────────────┘      └──────────────────┘      └──────────────────┘          │
│                                         │                                           │
└─────────────────────────────────────────┼───────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          PROTOCOL ASSISTANT SERVICE (Detail)                         │
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                              ROUTERS LAYER                                   │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │ Sessions │ │Documents │ │Generation│ │  Admin   │ │   Integrations   │   │   │
│  │  │  Router  │ │  Router  │ │  Router  │ │  Router  │ │      Router      │   │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘   │   │
│  └───────┼────────────┼────────────┼────────────┼────────────────┼─────────────┘   │
│          │            │            │            │                │                  │
│  ┌───────┼────────────┼────────────┼────────────┼────────────────┼─────────────┐   │
│  │       ▼            ▼            ▼            ▼                ▼             │   │
│  │                           SERVICES LAYER                                    │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │   │
│  │  │ Session  │ │ Document │ │Generation│ │  Admin   │ │   Integration    │  │   │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │ │     Service      │  │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘  │   │
│  └───────┼────────────┼────────────┼────────────┼────────────────┼─────────────┘   │
│          │            │            │            │                │                  │
│  ┌───────┼────────────┼────────────┼────────────┼────────────────┼─────────────┐   │
│  │       ▼            ▼            ▼            ▼                ▼             │   │
│  │                            CORE LAYER                                       │   │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │   │
│  │  │  LLM Manager  │  │   Template    │  │  Compliance   │  │    Audit    │  │   │
│  │  │  (Providers)  │  │    Engine     │  │    Engine     │  │    Logger   │  │   │
│  │  └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
                          │                                    │
        ┌─────────────────┼────────────────┐     ┌─────────────┼──────────────┐
        │                 │                │     │             │              │
        ▼                 ▼                ▼     ▼             ▼              ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐ ┌─────────────┐
│  PostgreSQL   │ │    Redis      │ │ File Storage  │ │   Claude    │ │   OpenAI    │
│  (Primary DB) │ │   (Cache)     │ │  (Documents)  │ │    API      │ │    API      │
└───────────────┘ └───────────────┘ └───────────────┘ └─────────────┘ └─────────────┘
```

## Component Overview

### API Gateway

The API Gateway handles all incoming requests and provides:

| Component | Responsibility |
|-----------|---------------|
| Auth Middleware | JWT validation, session management, role verification |
| Rate Limiter | Request throttling per user/institution |
| Request Router | Route requests to appropriate services |
| Response Transformer | Standardize response formats, error handling |

### Protocol Assistant Service

#### Routers Layer

| Router | Endpoints | Description |
|--------|-----------|-------------|
| Sessions Router | `/api/v1/assistant/sessions/*` | Manage conversation sessions |
| Documents Router | `/api/v1/assistant/documents/*` | Handle document operations |
| Generation Router | `/api/v1/assistant/generate/*` | AI content generation |
| Admin Router | `/api/v1/assistant/admin/*` | Administrative functions |
| Integrations Router | `/api/v1/assistant/integrations/*` | External service connections |

#### Services Layer

| Service | Responsibility |
|---------|---------------|
| Session Service | Create, update, retrieve conversation sessions; manage context |
| Document Service | Parse, store, version control for protocol documents |
| Generation Service | Orchestrate LLM calls, manage prompts, handle responses |
| Admin Service | Configuration, user management, feature flags |
| Integration Service | Connect to Zotero, Mendeley, REDCap |

#### Core Layer

| Component | Responsibility |
|-----------|---------------|
| LLM Manager | Provider abstraction, fallback handling, cost tracking |
| Template Engine | Institutional template processing, variable substitution |
| Compliance Engine | HIPAA validation, 21 CFR Part 11 checks, policy enforcement |
| Audit Logger | Complete audit trail for all operations |

## Data Flow

### Protocol Generation Flow

```
┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌─────────┐     ┌─────────┐
│  User   │────▶│ Frontend│────▶│ API Gateway │────▶│Protocol │────▶│   LLM   │
│         │     │         │     │             │     │Assistant│     │ Provider│
└─────────┘     └─────────┘     └─────────────┘     └─────────┘     └─────────┘
                                                          │
                                                          ▼
                                                    ┌─────────────┐
                                                    │  Database   │
                                                    │  (Sessions, │
                                                    │  Documents) │
                                                    └─────────────┘
```

**Step-by-step flow:**

1. **User Input** - User enters protocol information or asks a question
2. **Frontend Processing** - React app validates input, displays loading state
3. **API Gateway** - Authenticates request, applies rate limits
4. **Session Management** - Protocol Assistant loads or creates session context
5. **Context Assembly** - Gathers relevant context (previous messages, documents, templates)
6. **LLM Request** - Sends prompt to configured LLM provider
7. **Response Processing** - Validates and formats LLM response
8. **Persistence** - Saves session state and generated content
9. **Response** - Returns formatted response to frontend

### Document Processing Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Upload  │────▶│  File Parser │────▶│  Text        │────▶│  Document    │
│  Request │     │  (PDF/DOCX)  │     │  Extraction  │     │  Storage     │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                                   │
                                                                   ▼
                                                           ┌──────────────┐
                                                           │   Indexing   │
                                                           │  (Full-text) │
                                                           └──────────────┘
```

### Compliance Checking Flow

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Protocol │────▶│  Compliance  │────▶│  Rule        │────▶│  Validation  │
│  Section │     │  Engine      │     │  Evaluation  │     │  Results     │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                        │
                        ▼
                ┌──────────────┐
                │ Compliance   │
                │ Rules DB     │
                └──────────────┘
```

## Service Communication

### Internal Communication

Services communicate using:

1. **Synchronous REST** - For user-facing operations requiring immediate response
2. **Async Task Queue** - For long-running operations (document processing, batch generation)
3. **Event Bus** - For loosely coupled notifications (audit events, status updates)

### Communication Patterns

```
┌─────────────────────────────────────────────────────────────────┐
│                    Service Communication                         │
│                                                                  │
│  ┌──────────┐                              ┌──────────┐         │
│  │ Service A│◄────── REST (sync) ─────────▶│ Service B│         │
│  └──────────┘                              └──────────┘         │
│       │                                          │               │
│       │                                          │               │
│       ▼                                          ▼               │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Redis Pub/Sub                         │    │
│  │               (Events, Notifications)                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Celery Task Queue                      │    │
│  │              (Background Processing)                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### API Versioning

- All APIs are versioned with `/api/v1/` prefix
- Breaking changes require new version
- Multiple versions supported during transition periods
- Deprecation notices provided 6 months before removal

## LLM Provider Abstraction

The LLM Manager provides a unified interface for multiple AI providers, enabling:

- **Provider Independence** - Switch providers without code changes
- **Fallback Handling** - Automatic failover if primary provider fails
- **Cost Optimization** - Route tasks to cost-effective providers
- **Rate Limit Management** - Distribute load across providers

### Provider Interface

```python
class LLMProvider(Protocol):
    """Abstract interface for LLM providers."""

    async def complete(
        self,
        messages: list[Message],
        model: str,
        temperature: float,
        max_tokens: int,
        **kwargs
    ) -> CompletionResponse:
        """Generate a completion."""
        ...

    async def stream(
        self,
        messages: list[Message],
        model: str,
        **kwargs
    ) -> AsyncIterator[StreamChunk]:
        """Stream a completion."""
        ...

    def get_token_count(self, text: str) -> int:
        """Count tokens in text."""
        ...
```

### Provider Selection Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                    Provider Selection Flow                       │
│                                                                  │
│  ┌──────────┐     ┌───────────────┐     ┌──────────────────┐   │
│  │  Request │────▶│ Task Analyzer │────▶│ Provider Selector│   │
│  └──────────┘     └───────────────┘     └──────────────────┘   │
│                          │                       │               │
│                          ▼                       ▼               │
│                   ┌─────────────┐         ┌─────────────┐       │
│                   │ Task Config │         │  Provider   │       │
│                   │ (routing)   │         │  Registry   │       │
│                   └─────────────┘         └─────────────┘       │
│                                                  │               │
│                          ┌───────────────────────┘               │
│                          ▼                                       │
│           ┌──────────────────────────────────┐                  │
│           │      Configured Providers         │                  │
│           │  ┌────────┐  ┌────────┐  ┌────┐  │                  │
│           │  │ Claude │  │ OpenAI │  │ ...│  │                  │
│           │  └────────┘  └────────┘  └────┘  │                  │
│           └──────────────────────────────────┘                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Task Routing Configuration

Different tasks can be routed to different providers/models:

| Task Type | Default Provider | Model | Reasoning |
|-----------|-----------------|-------|-----------|
| Protocol Generation | Claude | claude-sonnet-4-20250514 | Best for structured document generation |
| Simple Q&A | OpenAI | gpt-4o-mini | Cost-effective for simple queries |
| Compliance Check | Claude | claude-sonnet-4-20250514 | Best reasoning for regulatory analysis |
| Summarization | OpenAI | gpt-4o | Good balance of quality and cost |

## Security Architecture

### Authentication Flow

```
┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌─────────────┐
│  User   │────▶│ Login   │────▶│  Auth       │────▶│   JWT       │
│         │     │ Request │     │  Service    │     │  Generation │
└─────────┘     └─────────┘     └─────────────┘     └─────────────┘
                                      │                    │
                                      ▼                    ▼
                              ┌─────────────┐      ┌─────────────┐
                              │  Password   │      │  Return     │
                              │  Validation │      │  Token      │
                              └─────────────┘      └─────────────┘
```

### Authorization Model

```
┌─────────────────────────────────────────────────────────────────┐
│                     Role-Based Access Control                    │
│                                                                  │
│  User ──┬── Institution ──┬── Roles ──┬── Permissions           │
│         │                 │           │                          │
│         │                 │           ├── protocol:read          │
│         │                 │           ├── protocol:write         │
│         │                 │           ├── protocol:delete        │
│         │                 │           ├── admin:read             │
│         │                 │           └── admin:write            │
│         │                 │                                      │
│         │                 ├── Researcher                         │
│         │                 ├── Reviewer                           │
│         │                 ├── Admin                              │
│         │                 └── Super Admin                        │
│         │                                                        │
│         └── Multi-institution support (SaaS)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Encryption

| Data State | Method | Key Management |
|------------|--------|----------------|
| At Rest | AES-256 | AWS KMS / HashiCorp Vault |
| In Transit | TLS 1.3 | Certificate rotation |
| Backups | AES-256 | Separate backup keys |

## Scalability Considerations

### Horizontal Scaling

```
┌─────────────────────────────────────────────────────────────────┐
│                    Horizontal Scaling Model                      │
│                                                                  │
│  ┌───────────────┐                                              │
│  │ Load Balancer │                                              │
│  └───────┬───────┘                                              │
│          │                                                       │
│    ┌─────┼─────┬─────────┐                                      │
│    │     │     │         │                                      │
│    ▼     ▼     ▼         ▼                                      │
│  ┌───┐ ┌───┐ ┌───┐    ┌───┐                                    │
│  │PA1│ │PA2│ │PA3│ ...│PA-n│  Protocol Assistant Instances      │
│  └───┘ └───┘ └───┘    └───┘                                    │
│    │     │     │         │                                      │
│    └─────┴─────┴─────────┘                                      │
│                │                                                 │
│         ┌──────┴──────┐                                         │
│         │             │                                         │
│         ▼             ▼                                         │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │  Primary DB │  │  Redis      │                               │
│  │  (Write)    │  │  Cluster    │                               │
│  └──────┬──────┘  └─────────────┘                               │
│         │                                                        │
│    ┌────┴────┐                                                   │
│    │         │                                                   │
│    ▼         ▼                                                   │
│  ┌────┐   ┌────┐                                                │
│  │Read│   │Read│  Read Replicas                                 │
│  │ 1  │   │ 2  │                                                │
│  └────┘   └────┘                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| API Response Time | < 200ms (p95) | Excluding LLM calls |
| LLM Response Time | < 10s (p95) | Streaming recommended |
| Concurrent Users | 1000+ | Per instance |
| Document Processing | < 30s | Per document |

### Caching Strategy

| Cache Type | TTL | Use Case |
|------------|-----|----------|
| Session Context | 1 hour | Conversation history |
| Template Cache | 24 hours | Institutional templates |
| Compliance Rules | 1 hour | Rule definitions |
| User Permissions | 5 minutes | RBAC lookups |

---

See [LLM Configuration](./LLM_CONFIGURATION.md) for detailed provider setup instructions.
