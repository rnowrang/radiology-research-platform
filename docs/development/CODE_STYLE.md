# Code Style Guide

This document defines the coding standards and conventions for the Protocol Assistant project.

## Table of Contents

- [General Principles](#general-principles)
- [Python Style](#python-style)
- [TypeScript Style](#typescript-style)
- [Naming Conventions](#naming-conventions)
- [Documentation Standards](#documentation-standards)
- [File Organization](#file-organization)
- [Tools and Configuration](#tools-and-configuration)

## General Principles

### Code Quality

1. **Readability First** - Code is read more often than written
2. **Explicit Over Implicit** - Be clear about what code does
3. **Single Responsibility** - Each function/class does one thing
4. **DRY** - Don't Repeat Yourself
5. **KISS** - Keep It Simple, Stupid

### Best Practices

- Write self-documenting code with clear names
- Keep functions small (< 20 lines ideal)
- Limit line length to 100 characters
- Use early returns to reduce nesting
- Handle errors explicitly
- Write tests for all new code

## Python Style

### PEP 8 Compliance

Follow [PEP 8](https://pep8.org/) with the following project-specific additions.

### Imports

```python
# Standard library imports
import os
from datetime import datetime
from typing import Optional, List

# Third-party imports
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

# Local imports
from app.database import get_db
from app.models import User, ProtocolSession
from app.services.session import SessionService
```

**Import Order:**
1. Standard library
2. Third-party packages
3. Local modules

Use `isort` for automatic sorting.

### Type Hints

**Always use type hints for:**
- Function parameters
- Function return values
- Class attributes

```python
# Good
def get_user_sessions(
    user_id: str,
    status: Optional[str] = None,
    limit: int = 20,
) -> list[ProtocolSession]:
    ...

# Good - Union types
def parse_response(data: str | dict) -> ParsedResponse:
    ...

# Good - Generic types
from typing import TypeVar, Generic

T = TypeVar("T")

class Repository(Generic[T]):
    async def get(self, id: str) -> T | None:
        ...
```

### Classes

```python
from dataclasses import dataclass
from pydantic import BaseModel

# Use dataclasses for simple data containers
@dataclass
class SessionContext:
    session_id: str
    user_id: str
    messages: list[Message]
    created_at: datetime


# Use Pydantic for validation and serialization
class CreateSessionRequest(BaseModel):
    protocol_type: str
    title: str
    template_id: str | None = None

    class Config:
        str_strip_whitespace = True


# Use regular classes for services
class SessionService:
    """Service for managing protocol sessions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_session(
        self,
        user_id: str,
        request: CreateSessionRequest,
    ) -> ProtocolSession:
        """Create a new protocol session.

        Args:
            user_id: ID of the user creating the session.
            request: Session creation request data.

        Returns:
            The newly created session.

        Raises:
            ValidationError: If request data is invalid.
        """
        ...
```

### Functions

```python
# Good: Clear function with docstring
async def generate_section(
    session_id: str,
    section_type: str,
    context: dict[str, Any] | None = None,
) -> GeneratedSection:
    """Generate a protocol section using AI.

    Args:
        session_id: ID of the protocol session.
        section_type: Type of section to generate.
        context: Optional additional context for generation.

    Returns:
        The generated section with content and metadata.

    Raises:
        SessionNotFoundError: If session doesn't exist.
        GenerationError: If AI generation fails.
    """
    session = await get_session(session_id)
    if not session:
        raise SessionNotFoundError(f"Session {session_id} not found")

    # Build prompt with context
    prompt = build_generation_prompt(session, section_type, context)

    # Generate with LLM
    response = await llm_service.generate(prompt)

    return GeneratedSection(
        section_type=section_type,
        content=response.content,
        confidence=response.confidence,
    )


# Good: Use early returns
def validate_session_status(session: ProtocolSession) -> None:
    if session.deleted_at:
        raise SessionDeletedError("Session has been deleted")

    if session.status == "completed":
        raise SessionCompletedError("Session is already completed")

    if session.status == "archived":
        raise SessionArchivedError("Session is archived")

    # Session is valid - continue
```

### Error Handling

```python
# Define custom exceptions
class ProtocolAssistantError(Exception):
    """Base exception for Protocol Assistant."""
    pass

class SessionNotFoundError(ProtocolAssistantError):
    """Raised when session is not found."""
    pass

class GenerationError(ProtocolAssistantError):
    """Raised when AI generation fails."""
    pass


# Handle specific exceptions
try:
    result = await generate_section(session_id, section_type)
except SessionNotFoundError:
    raise HTTPException(status_code=404, detail="Session not found")
except GenerationError as e:
    logger.error(f"Generation failed: {e}")
    raise HTTPException(status_code=502, detail="Generation service unavailable")
except Exception as e:
    logger.exception("Unexpected error")
    raise HTTPException(status_code=500, detail="Internal server error")
```

### Async/Await

```python
# Good: Use async for I/O operations
async def fetch_session_with_messages(session_id: str) -> SessionWithMessages:
    # Parallel execution for independent operations
    session, messages = await asyncio.gather(
        get_session(session_id),
        get_session_messages(session_id),
    )
    return SessionWithMessages(session=session, messages=messages)


# Good: Use async context managers
async def process_document(file: UploadFile) -> Document:
    async with aiofiles.open(temp_path, "wb") as f:
        await f.write(await file.read())

    return await parse_document(temp_path)
```

## TypeScript Style

### ESLint Configuration

Follow the project ESLint configuration with TypeScript strict mode.

### Type Definitions

```typescript
// Use interfaces for object shapes
interface ProtocolSession {
  id: string;
  userId: string;
  title: string;
  protocolType: ProtocolType;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Use type aliases for unions and primitives
type ProtocolType = 'human_subjects' | 'animal_research' | 'exempt';
type SessionStatus = 'active' | 'completed' | 'archived';

// Use enums sparingly (prefer string unions)
// OK for when you need reverse mapping
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
}
```

### Components

```tsx
// Good: Functional component with props interface
interface SessionCardProps {
  session: ProtocolSession;
  onSelect: (sessionId: string) => void;
  isSelected?: boolean;
}

export function SessionCard({
  session,
  onSelect,
  isSelected = false,
}: SessionCardProps): JSX.Element {
  const handleClick = useCallback(() => {
    onSelect(session.id);
  }, [onSelect, session.id]);

  return (
    <div
      className={cn('session-card', { selected: isSelected })}
      onClick={handleClick}
    >
      <h3>{session.title}</h3>
      <span className="status">{session.status}</span>
    </div>
  );
}
```

### Hooks

```typescript
// Good: Custom hook with clear return type
interface UseSessionReturn {
  session: ProtocolSession | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSession(sessionId: string): UseSessionReturn {
  const [session, setSession] = useState<ProtocolSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.getSession(sessionId);
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { session, isLoading, error, refetch: fetchSession };
}
```

### API Calls

```typescript
// Good: Typed API client
class SessionApi {
  private readonly baseUrl = '/api/v1/assistant/sessions';

  async create(request: CreateSessionRequest): Promise<ProtocolSession> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }

  async get(sessionId: string): Promise<ProtocolSession> {
    const response = await fetch(`${this.baseUrl}/${sessionId}`);

    if (!response.ok) {
      throw new ApiError(response.status, await response.text());
    }

    return response.json();
  }
}

export const sessionApi = new SessionApi();
```

## Naming Conventions

### Python

| Type | Convention | Example |
|------|------------|---------|
| Variables | snake_case | `user_session` |
| Functions | snake_case | `get_user_sessions` |
| Classes | PascalCase | `ProtocolSession` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Modules | snake_case | `session_service.py` |
| Private | _prefix | `_internal_method` |

### TypeScript

| Type | Convention | Example |
|------|------------|---------|
| Variables | camelCase | `userSession` |
| Functions | camelCase | `getUserSessions` |
| Classes | PascalCase | `SessionService` |
| Interfaces | PascalCase | `ISessionService` (optional I prefix) |
| Types | PascalCase | `SessionStatus` |
| Constants | UPPER_SNAKE or PascalCase | `MAX_RETRIES` |
| Components | PascalCase | `SessionCard.tsx` |

### Database

| Type | Convention | Example |
|------|------------|---------|
| Tables | snake_case, plural | `protocol_sessions` |
| Columns | snake_case | `created_at` |
| Primary Keys | `id` | `id UUID` |
| Foreign Keys | `{table}_id` | `user_id` |
| Indexes | `idx_{table}_{column}` | `idx_sessions_user_id` |

### Files and Directories

```
backend/
  app/
    models/           # Database models
      user.py
      session.py
    schemas/          # Pydantic schemas
      user.py
      session.py
    services/         # Business logic
      session_service.py
    routers/          # API endpoints
      sessions.py

frontend/
  src/
    components/       # React components
      SessionCard/
        SessionCard.tsx
        SessionCard.test.tsx
        index.ts
    hooks/            # Custom hooks
      useSession.ts
    types/            # TypeScript types
      session.ts
    utils/            # Utility functions
      formatDate.ts
```

## Documentation Standards

### Docstrings (Python)

Use Google-style docstrings:

```python
def create_session(
    user_id: str,
    protocol_type: str,
    title: str,
    template_id: str | None = None,
) -> ProtocolSession:
    """Create a new protocol session.

    Creates a new protocol session for the specified user with the given
    protocol type and title. Optionally uses a template as starting point.

    Args:
        user_id: The unique identifier of the user.
        protocol_type: Type of protocol (e.g., 'human_subjects').
        title: Title for the new protocol.
        template_id: Optional template ID to use as starting point.

    Returns:
        The newly created ProtocolSession object.

    Raises:
        UserNotFoundError: If the user_id doesn't exist.
        TemplateNotFoundError: If template_id is provided but not found.
        ValidationError: If protocol_type or title is invalid.

    Example:
        >>> session = create_session(
        ...     user_id="usr_123",
        ...     protocol_type="human_subjects",
        ...     title="My Research Study",
        ... )
        >>> print(session.id)
        sess_abc123
    """
    ...
```

### JSDoc (TypeScript)

```typescript
/**
 * Create a new protocol session.
 *
 * @param request - The session creation request
 * @param request.protocolType - Type of protocol
 * @param request.title - Title for the session
 * @returns Promise resolving to the created session
 * @throws {ApiError} If the request fails
 *
 * @example
 * const session = await createSession({
 *   protocolType: 'human_subjects',
 *   title: 'My Study',
 * });
 */
async function createSession(
  request: CreateSessionRequest
): Promise<ProtocolSession> {
  ...
}
```

### Inline Comments

```python
# Good: Explain WHY, not WHAT
# Rate limit to 100 requests/minute per Anthropic API limits
rate_limiter = RateLimiter(100, 60)

# Good: Explain complex logic
# Use exponential backoff with jitter to prevent thundering herd
delay = base_delay * (2 ** attempt) + random.uniform(0, 1)

# Bad: States the obvious
# Increment counter by 1
counter += 1
```

## File Organization

### Python Module Structure

```python
"""Session service module.

This module provides the SessionService class for managing protocol sessions.
"""

# Imports (in order: stdlib, third-party, local)
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProtocolSession
from app.schemas import CreateSessionRequest


# Constants
DEFAULT_SESSION_STATUS = "active"
MAX_SESSIONS_PER_USER = 100


# Exceptions
class SessionError(Exception):
    """Base exception for session errors."""
    pass


# Main class/functions
class SessionService:
    """Service for managing protocol sessions."""
    ...


# Helper functions (private)
def _validate_session_title(title: str) -> str:
    """Validate and normalize session title."""
    ...
```

### React Component Structure

```tsx
// Imports
import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import type { ProtocolSession } from '@/types';

// Types
interface SessionFormProps {
  onSubmit: (data: FormData) => Promise<void>;
  initialData?: Partial<FormData>;
}

interface FormData {
  title: string;
  protocolType: string;
}

// Component
export function SessionForm({
  onSubmit,
  initialData,
}: SessionFormProps): JSX.Element {
  // State
  const [title, setTitle] = useState(initialData?.title ?? '');

  // Callbacks
  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit({ title, protocolType });
  }, [title, protocolType, onSubmit]);

  // Render
  return (
    <form onSubmit={handleSubmit}>
      ...
    </form>
  );
}

// Helpers (if small, otherwise separate file)
function validateTitle(title: string): boolean {
  return title.length >= 3 && title.length <= 200;
}
```

## Tools and Configuration

### Python Tools

```bash
# Linting and formatting
ruff check .                  # Lint
ruff check --fix .            # Lint with auto-fix
ruff format .                 # Format

# Type checking
mypy .

# Import sorting (handled by ruff)
ruff check --select I --fix .
```

**pyproject.toml:**
```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]

[tool.mypy]
python_version = "3.11"
strict = true
```

### TypeScript Tools

```bash
# Linting
npm run lint                  # ESLint
npm run lint:fix              # ESLint with fix

# Formatting
npm run format                # Prettier

# Type checking
npm run type-check            # TypeScript compiler
```

**eslint.config.js:**
```javascript
export default {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
  },
};
```

### Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: local
    hooks:
      - id: ruff
        name: ruff
        entry: ruff check --fix
        language: system
        types: [python]

      - id: ruff-format
        name: ruff-format
        entry: ruff format
        language: system
        types: [python]

      - id: mypy
        name: mypy
        entry: mypy
        language: system
        types: [python]

      - id: eslint
        name: eslint
        entry: npm run lint
        language: system
        types: [typescript, tsx]
```

---

*Questions about code style? Open a discussion on GitHub.*
