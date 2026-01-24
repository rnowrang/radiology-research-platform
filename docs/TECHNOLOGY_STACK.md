# Technology Stack

This document provides a comprehensive overview of all technologies used in the Radiology Research Platform.

---

## Overview

| Layer | Technology | Version | Port |
|-------|------------|---------|------|
| Frontend | React + TypeScript | 18.2.0 | 5174 |
| UI Framework | Tailwind CSS + shadcn/ui | 3.4.0 | - |
| API Gateway | Node.js + Express | 18.x / 4.x | 3001 |
| Forms Service | Python + FastAPI | 3.11 / 0.109 | 8001 |
| Protocol Assistant | Python + FastAPI | 3.11 / 0.109 | 8002 |
| Database | PostgreSQL | 15 | 5434 |
| Containerization | Docker + Docker Compose | 24.x | - |
| PDF Generation | LibreOffice | 7.x | - |

---

## Frontend Stack

### Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.2.0 | UI library |
| react-dom | ^18.2.0 | React DOM rendering |
| typescript | ^5.2.2 | Type safety |
| vite | ^5.0.8 | Build tool and dev server |

### Routing & State

| Package | Version | Purpose |
|---------|---------|---------|
| react-router-dom | ^6.21.0 | Client-side routing |
| zustand | ^4.5.0 | Global state management |
| @tanstack/react-query | ^5.17.0 | Server state management |

### UI Components

| Package | Version | Purpose |
|---------|---------|---------|
| tailwindcss | ^3.4.0 | Utility-first CSS |
| tailwindcss-animate | ^1.0.7 | Animation utilities |
| class-variance-authority | ^0.7.0 | Component variants |
| clsx | ^2.0.0 | Class name utility |
| tailwind-merge | ^2.2.0 | Tailwind class merging |
| lucide-react | ^0.303.0 | Icon library |

### Radix UI Primitives (shadcn/ui)

| Package | Version | Purpose |
|---------|---------|---------|
| @radix-ui/react-dialog | ^1.0.5 | Modal dialogs |
| @radix-ui/react-dropdown-menu | ^2.0.6 | Dropdown menus |
| @radix-ui/react-select | ^2.0.0 | Select inputs |
| @radix-ui/react-tabs | ^1.0.4 | Tab navigation |
| @radix-ui/react-toast | ^1.1.5 | Toast notifications |
| @radix-ui/react-checkbox | ^1.0.4 | Checkbox inputs |
| @radix-ui/react-radio-group | ^1.1.3 | Radio button groups |
| @radix-ui/react-accordion | ^1.1.2 | Accordion panels |
| @radix-ui/react-collapsible | ^1.0.3 | Collapsible sections |
| @radix-ui/react-avatar | ^1.0.4 | User avatars |
| @radix-ui/react-progress | ^1.0.3 | Progress bars |
| @radix-ui/react-label | ^2.0.2 | Form labels |
| @radix-ui/react-slot | ^1.0.2 | Slot composition |
| @radix-ui/react-separator | ^1.0.3 | Visual separators |
| @radix-ui/react-scroll-area | ^1.0.5 | Custom scrollbars |
| @radix-ui/react-tooltip | ^1.0.7 | Tooltips |
| @radix-ui/react-popover | ^1.0.7 | Popovers |
| @radix-ui/react-alert-dialog | ^1.0.5 | Alert dialogs |
| @radix-ui/react-switch | ^1.0.3 | Toggle switches |

### Data Visualization

| Package | Version | Purpose |
|---------|---------|---------|
| recharts | ^2.10.0 | Charts and analytics visualizations |

### Forms & Validation

| Package | Version | Purpose |
|---------|---------|---------|
| react-hook-form | ^7.49.3 | Form handling |
| @hookform/resolvers | ^3.3.2 | Validation resolvers |
| zod | ^3.22.4 | Schema validation |

### HTTP Client

| Package | Version | Purpose |
|---------|---------|---------|
| axios | ^1.6.2 | HTTP requests |

### Utilities

| Package | Version | Purpose |
|---------|---------|---------|
| date-fns | ^3.0.0 | Date manipulation |

### Development Tools

| Package | Version | Purpose |
|---------|---------|---------|
| @vitejs/plugin-react | ^4.2.1 | Vite React plugin |
| @types/react | ^18.2.43 | React type definitions |
| @types/react-dom | ^18.2.17 | React DOM types |
| eslint | ^8.55.0 | Linting |
| @typescript-eslint/parser | ^6.14.0 | TypeScript ESLint |
| @typescript-eslint/eslint-plugin | ^6.14.0 | TypeScript rules |
| eslint-plugin-react-hooks | ^4.6.0 | React hooks rules |
| eslint-plugin-react-refresh | ^0.4.5 | Fast refresh rules |
| autoprefixer | ^10.4.16 | CSS vendor prefixes |
| postcss | ^8.4.32 | CSS processing |

---

## Gateway Service Stack (Node.js)

### Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | Web framework |
| typescript | ^5.3.3 | Type safety |
| ts-node-dev | ^2.0.0 | Development server |

### Authentication & Security

| Package | Version | Purpose |
|---------|---------|---------|
| jsonwebtoken | ^9.0.2 | JWT tokens |
| bcryptjs | ^2.4.3 | Password hashing |
| helmet | ^7.1.0 | Security headers |
| cors | ^2.8.5 | CORS middleware |
| express-rate-limit | ^7.1.5 | Rate limiting |

### Database

| Package | Version | Purpose |
|---------|---------|---------|
| pg | ^8.11.3 | PostgreSQL client |

### HTTP Client

| Package | Version | Purpose |
|---------|---------|---------|
| axios | ^1.6.5 | HTTP requests to Forms Service |

### Logging

| Package | Version | Purpose |
|---------|---------|---------|
| winston | ^3.11.0 | Structured logging |

### Validation

| Package | Version | Purpose |
|---------|---------|---------|
| express-validator | ^7.0.1 | Request validation |

### Development Tools

| Package | Version | Purpose |
|---------|---------|---------|
| @types/express | ^4.17.21 | Express types |
| @types/node | ^20.10.6 | Node.js types |
| @types/cors | ^2.8.17 | CORS types |
| @types/jsonwebtoken | ^9.0.5 | JWT types |
| @types/bcryptjs | ^2.4.6 | bcrypt types |
| @types/pg | ^8.10.9 | PostgreSQL types |

---

## Forms Service Stack (Python)

### Core Framework

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | >=0.109.0 | Web framework |
| uvicorn[standard] | >=0.27.0 | ASGI server |
| python-multipart | >=0.0.6 | Form data handling |

### Database

| Package | Version | Purpose |
|---------|---------|---------|
| sqlalchemy | >=2.0.25 | ORM |
| psycopg2-binary | >=2.9.9 | PostgreSQL adapter |
| alembic | >=1.13.1 | Database migrations |

### Configuration

| Package | Version | Purpose |
|---------|---------|---------|
| pydantic | >=2.5.3 | Data validation |
| pydantic-settings | >=2.1.0 | Environment settings |

### Document Generation

| Package | Version | Purpose |
|---------|---------|---------|
| python-docx | >=1.1.0 | DOCX manipulation |
| lxml | >=5.1.0 | XML processing |

### System Dependencies (Docker)

| Package | Purpose |
|---------|---------|
| libreoffice | PDF conversion from DOCX |
| libreoffice-writer | Writer component for DOCX |
| libpq-dev | PostgreSQL development files |
| gcc | C compiler for native extensions |

---

## Protocol Assistant Service

- **Runtime**: Python 3.11+
- **Framework**: FastAPI, Uvicorn
- **ORM**: SQLAlchemy 2.0 with AsyncPG
- **AI/LLM**:
  - Anthropic Claude SDK (anthropic 0.18.0+)
  - OpenAI SDK (openai 1.12.0+)
- **Document Processing**: PyPDF2, python-docx
- **Security**: cryptography (Fernet encryption for credentials)
- **Resilience**: tenacity (retry logic)
- **Async**: asyncio, httpx

### Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| fastapi | >=0.109.0 | Web framework |
| uvicorn[standard] | >=0.27.0 | ASGI server |
| sqlalchemy | >=2.0.25 | ORM |
| asyncpg | >=0.29.0 | Async PostgreSQL driver |

### AI/LLM Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| anthropic | >=0.18.0 | Anthropic Claude SDK |
| openai | >=1.12.0 | OpenAI SDK |

### Document Processing

| Package | Version | Purpose |
|---------|---------|---------|
| PyPDF2 | >=3.0.0 | PDF reading and parsing |
| python-docx | >=1.1.0 | DOCX manipulation |

### Security & Resilience

| Package | Version | Purpose |
|---------|---------|---------|
| cryptography | >=42.0.0 | Fernet encryption for credentials |
| tenacity | >=8.2.0 | Retry logic for API calls |

### Async & HTTP

| Package | Version | Purpose |
|---------|---------|---------|
| httpx | >=0.26.0 | Async HTTP client |
| asyncio | stdlib | Async runtime |

---

## Database Stack

### PostgreSQL 15

**Features Used**:
- JSONB columns for flexible schema storage
- UUID primary keys
- Foreign key constraints
- Check constraints
- Indexes for query optimization
- Timestamp columns with timezone

**Extensions** (available if needed):
- `uuid-ossp` - UUID generation
- `pgcrypto` - Cryptographic functions

---

## Infrastructure Stack

### Docker

| Component | Version | Purpose |
|-----------|---------|---------|
| Docker Engine | 24.x | Container runtime |
| Docker Compose | 2.x | Multi-container orchestration |

### Base Images

| Service | Base Image | Size |
|---------|------------|------|
| Database | postgres:15-alpine | ~230MB |
| Gateway | node:18-alpine | ~170MB |
| Forms Service | python:3.11-slim | ~150MB + LibreOffice |
| Frontend | node:20-alpine | ~180MB |

### Production Images (Future)

| Service | Base Image | Purpose |
|---------|------------|---------|
| Frontend | nginx:alpine | Static file serving |

---

## Development Tools

### Version Control

| Tool | Purpose |
|------|---------|
| Git | Source control |
| GitHub | Repository hosting (planned) |

### IDE/Editor Support

| File | Purpose |
|------|---------|
| tsconfig.json | TypeScript configuration |
| .eslintrc | ESLint configuration |
| tailwind.config.ts | Tailwind customization |
| components.json | shadcn/ui configuration |

### API Documentation

| Tool | URL | Purpose |
|------|-----|---------|
| FastAPI Swagger (Forms) | http://localhost:8001/docs | Forms Service API docs |
| FastAPI ReDoc (Forms) | http://localhost:8001/redoc | Alternative API docs |
| FastAPI Swagger (Protocol Assistant) | http://localhost:8002/docs | Protocol Assistant API docs |
| FastAPI ReDoc (Protocol Assistant) | http://localhost:8002/redoc | Alternative API docs |

---

## Security Libraries

### Authentication

| Component | Library | Algorithm |
|-----------|---------|-----------|
| Password Hashing | bcryptjs | bcrypt (12 rounds) |
| Token Generation | jsonwebtoken | HS256 |
| Token Storage | localStorage | Browser storage |

### Request Security

| Component | Library | Purpose |
|-----------|---------|---------|
| Headers | helmet | Security headers |
| CORS | cors | Cross-origin protection |
| Rate Limiting | express-rate-limit | DDoS protection |

---

## File Formats

### Data Formats

| Format | Purpose |
|--------|---------|
| JSON | API requests/responses |
| JSONB | Database schema storage |
| JWT | Authentication tokens |

### Document Formats

| Format | Purpose | Library |
|--------|---------|---------|
| DOCX | Form templates | python-docx |
| PDF | Generated documents | LibreOffice |

---

## Environment Variables

### Gateway Service

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgres://user:pass@host:5434/db
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
FORMS_SERVICE_URL=http://forms-service:8001
PROTOCOL_ASSISTANT_URL=http://protocol-assistant:8002
INTERNAL_API_KEY=internal-key
CORS_ORIGIN=http://localhost:5174
```

### Forms Service

```bash
DATABASE_URL=postgres://user:pass@host:5434/db
SECRET_KEY=your-secret-key
INTERNAL_API_KEY=internal-key
GATEWAY_URL=http://gateway:3001
STORAGE_PATH=/app/storage
TEMPLATE_DIR=/app/storage/templates
GENERATED_DIR=/app/storage/generated
LIBREOFFICE_PATH=/usr/bin/soffice
DEBUG=true
```

### Protocol Assistant Service

```bash
DATABASE_URL=postgres://user:pass@host:5434/db
SECRET_KEY=your-secret-key
INTERNAL_API_KEY=internal-key
GATEWAY_URL=http://gateway:3001
ANTHROPIC_API_KEY=your-anthropic-key
OPENAI_API_KEY=your-openai-key
ENCRYPTION_KEY=your-fernet-key
DEBUG=true
```

### Frontend

```bash
VITE_API_URL=http://localhost:3001/api
VITE_FRONTEND_PORT=5174
```

---

## Compatibility Matrix

### Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

### Node.js Compatibility

| Service | Node Version |
|---------|--------------|
| Gateway | 18.x LTS |
| Frontend (build) | 20.x LTS |

### Python Compatibility

| Service | Python Version |
|---------|----------------|
| Forms Service | 3.11+ |
| Protocol Assistant | 3.11+ |

---

## Update Policy

### Security Updates
- Apply security patches within 48 hours
- Review CVE notifications weekly

### Dependency Updates
- Minor version updates: Monthly
- Major version updates: Quarterly (after testing)

### Framework Updates
- React: Follow LTS releases
- FastAPI: Stay current (breaking changes rare)
- Express: Follow LTS releases

---

*Last Updated: January 23, 2026*
