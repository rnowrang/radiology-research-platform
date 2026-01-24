# Testing Guide

This document describes the testing requirements, patterns, and best practices for the Protocol Assistant project.

## Table of Contents

- [Overview](#overview)
- [Unit Tests](#unit-tests)
- [Integration Tests](#integration-tests)
- [End-to-End Tests](#end-to-end-tests)
- [Mocking LLM Responses](#mocking-llm-responses)
- [Test Configuration](#test-configuration)
- [Running Tests](#running-tests)
- [Coverage Requirements](#coverage-requirements)

## Overview

### Testing Philosophy

1. **Test Behavior, Not Implementation** - Focus on what code does, not how
2. **Arrange-Act-Assert** - Structure tests clearly
3. **Independent Tests** - Each test should run in isolation
4. **Fast Feedback** - Keep tests fast to encourage running often
5. **Meaningful Coverage** - Quality over quantity

### Test Types

| Type | Purpose | Speed | Scope |
|------|---------|-------|-------|
| Unit | Test individual functions/classes | Fast | Single unit |
| Integration | Test component interactions | Medium | Multiple components |
| E2E | Test user workflows | Slow | Full system |

### Test Pyramid

```
           /\
          /  \
         / E2E\       <- Few, critical user journeys
        /------\
       /        \
      /Integration\   <- More, test integrations
     /--------------\
    /                \
   /    Unit Tests    \  <- Many, fast, isolated
  /____________________\
```

## Unit Tests

### Python Unit Tests

#### File Structure

```
backend/
  tests/
    unit/
      services/
        test_session_service.py
        test_generation_service.py
      models/
        test_session_model.py
      utils/
        test_validators.py
    conftest.py
```

#### Basic Test Structure

```python
# tests/unit/services/test_session_service.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.services.session import SessionService
from app.schemas.session import CreateSessionRequest

class TestSessionService:
    """Tests for SessionService."""

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        return AsyncMock()

    @pytest.fixture
    def service(self, mock_db):
        """Create a SessionService instance with mocked dependencies."""
        return SessionService(db=mock_db)

    async def test_create_session_returns_session_with_active_status(
        self,
        service,
        mock_db,
    ):
        """Creating a session should return a session with active status."""
        # Arrange
        user_id = "usr_123"
        request = CreateSessionRequest(
            protocol_type="human_subjects",
            title="Test Protocol",
        )

        # Act
        result = await service.create_session(user_id, request)

        # Assert
        assert result.status == "active"
        assert result.user_id == user_id
        assert result.title == "Test Protocol"

    async def test_create_session_saves_to_database(
        self,
        service,
        mock_db,
    ):
        """Creating a session should persist it to the database."""
        # Arrange
        request = CreateSessionRequest(
            protocol_type="human_subjects",
            title="Test Protocol",
        )

        # Act
        await service.create_session("usr_123", request)

        # Assert
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    async def test_create_session_raises_error_for_invalid_type(
        self,
        service,
    ):
        """Creating a session with invalid type should raise ValidationError."""
        # Arrange
        request = CreateSessionRequest(
            protocol_type="invalid_type",
            title="Test Protocol",
        )

        # Act & Assert
        with pytest.raises(ValidationError) as exc_info:
            await service.create_session("usr_123", request)

        assert "protocol_type" in str(exc_info.value)
```

#### Testing Async Code

```python
import pytest
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_async_function():
    """Test asynchronous function."""
    # Mock async dependencies
    mock_client = AsyncMock()
    mock_client.fetch.return_value = {"data": "value"}

    # Call async function
    result = await process_data(mock_client)

    # Assert
    assert result.processed is True
    mock_client.fetch.assert_awaited_once()
```

#### Parametrized Tests

```python
import pytest

@pytest.mark.parametrize("protocol_type,expected_sections", [
    ("human_subjects", ["objectives", "methodology", "consent"]),
    ("animal_research", ["objectives", "methodology", "iacuc"]),
    ("exempt", ["objectives", "methodology"]),
])
def test_get_required_sections_returns_correct_sections(
    protocol_type,
    expected_sections,
):
    """Required sections should match protocol type."""
    result = get_required_sections(protocol_type)
    assert result == expected_sections
```

### TypeScript Unit Tests

#### File Structure

```
frontend/
  src/
    components/
      SessionCard/
        SessionCard.tsx
        SessionCard.test.tsx
    hooks/
      useSession.ts
      useSession.test.ts
    utils/
      formatDate.ts
      formatDate.test.ts
```

#### Component Testing

```tsx
// SessionCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionCard } from './SessionCard';

describe('SessionCard', () => {
  const mockSession = {
    id: 'sess_123',
    title: 'Test Protocol',
    status: 'active' as const,
    createdAt: new Date('2024-01-15'),
  };

  it('renders session title', () => {
    render(<SessionCard session={mockSession} onSelect={jest.fn()} />);

    expect(screen.getByText('Test Protocol')).toBeInTheDocument();
  });

  it('calls onSelect with session id when clicked', () => {
    const onSelect = jest.fn();
    render(<SessionCard session={mockSession} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledWith('sess_123');
  });

  it('displays active status badge', () => {
    render(<SessionCard session={mockSession} onSelect={jest.fn()} />);

    expect(screen.getByText('active')).toHaveClass('status-active');
  });

  it('shows selected styling when isSelected is true', () => {
    render(
      <SessionCard
        session={mockSession}
        onSelect={jest.fn()}
        isSelected={true}
      />
    );

    expect(screen.getByRole('button')).toHaveClass('selected');
  });
});
```

#### Hook Testing

```tsx
// useSession.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useSession } from './useSession';
import { sessionApi } from '@/api/session';

jest.mock('@/api/session');

describe('useSession', () => {
  const mockSession = {
    id: 'sess_123',
    title: 'Test Protocol',
    status: 'active',
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('fetches session on mount', async () => {
    (sessionApi.get as jest.Mock).mockResolvedValue(mockSession);

    const { result } = renderHook(() => useSession('sess_123'));

    await waitFor(() => {
      expect(result.current.session).toEqual(mockSession);
    });

    expect(sessionApi.get).toHaveBeenCalledWith('sess_123');
  });

  it('sets loading state during fetch', async () => {
    (sessionApi.get as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    const { result } = renderHook(() => useSession('sess_123'));

    expect(result.current.isLoading).toBe(true);
  });

  it('sets error state on failure', async () => {
    const error = new Error('Failed to fetch');
    (sessionApi.get as jest.Mock).mockRejectedValue(error);

    const { result } = renderHook(() => useSession('sess_123'));

    await waitFor(() => {
      expect(result.current.error).toEqual(error);
    });
  });
});
```

## Integration Tests

### API Integration Tests

```python
# tests/integration/test_sessions_api.py
import pytest
from httpx import AsyncClient
from app.main import app
from app.database import get_db
from tests.factories import UserFactory, SessionFactory

@pytest.fixture
async def client():
    """Create test client."""
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

@pytest.fixture
async def authenticated_client(client, test_user):
    """Create authenticated test client."""
    token = create_test_token(test_user.id)
    client.headers["Authorization"] = f"Bearer {token}"
    return client

class TestSessionsAPI:
    """Integration tests for sessions API."""

    async def test_create_session_returns_201(
        self,
        authenticated_client,
    ):
        """POST /sessions should return 201 with session data."""
        response = await authenticated_client.post(
            "/api/v1/assistant/sessions",
            json={
                "protocol_type": "human_subjects",
                "title": "Test Protocol",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["success"] is True
        assert data["data"]["title"] == "Test Protocol"
        assert "session_id" in data["data"]

    async def test_create_session_validates_input(
        self,
        authenticated_client,
    ):
        """POST /sessions should return 400 for invalid input."""
        response = await authenticated_client.post(
            "/api/v1/assistant/sessions",
            json={
                "protocol_type": "invalid",
                "title": "",
            },
        )

        assert response.status_code == 400
        data = response.json()
        assert data["success"] is False
        assert "error" in data

    async def test_get_session_returns_session_data(
        self,
        authenticated_client,
        test_session,
    ):
        """GET /sessions/{id} should return session data."""
        response = await authenticated_client.get(
            f"/api/v1/assistant/sessions/{test_session.id}",
        )

        assert response.status_code == 200
        data = response.json()
        assert data["data"]["session_id"] == str(test_session.id)

    async def test_get_session_returns_404_for_nonexistent(
        self,
        authenticated_client,
    ):
        """GET /sessions/{id} should return 404 for nonexistent session."""
        response = await authenticated_client.get(
            "/api/v1/assistant/sessions/nonexistent_id",
        )

        assert response.status_code == 404

    async def test_unauthorized_request_returns_401(self, client):
        """Requests without auth should return 401."""
        response = await client.get("/api/v1/assistant/sessions")

        assert response.status_code == 401
```

### Database Integration Tests

```python
# tests/integration/test_session_repository.py
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.repositories.session import SessionRepository
from app.models import ProtocolSession

@pytest.fixture
async def db_session(test_database):
    """Create database session for tests."""
    async with test_database.session() as session:
        yield session
        await session.rollback()

class TestSessionRepository:
    """Integration tests for SessionRepository."""

    async def test_create_persists_session(self, db_session):
        """Creating a session should persist it to database."""
        repo = SessionRepository(db_session)

        session = await repo.create(
            user_id="usr_123",
            protocol_type="human_subjects",
            title="Test",
        )

        # Verify in database
        result = await db_session.get(ProtocolSession, session.id)
        assert result is not None
        assert result.title == "Test"

    async def test_find_by_user_returns_user_sessions(self, db_session):
        """Finding by user should return only that user's sessions."""
        repo = SessionRepository(db_session)

        # Create sessions for different users
        await repo.create(user_id="usr_1", protocol_type="human_subjects", title="S1")
        await repo.create(user_id="usr_1", protocol_type="human_subjects", title="S2")
        await repo.create(user_id="usr_2", protocol_type="human_subjects", title="S3")

        # Find user 1's sessions
        sessions = await repo.find_by_user("usr_1")

        assert len(sessions) == 2
        assert all(s.user_id == "usr_1" for s in sessions)
```

## End-to-End Tests

### Playwright E2E Tests

```typescript
// e2e/sessions.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Protocol Sessions', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('user can create a new protocol session', async ({ page }) => {
    // Navigate to create session
    await page.click('text=New Protocol');
    await expect(page).toHaveURL('/sessions/new');

    // Fill in session details
    await page.fill('[name="title"]', 'My Research Protocol');
    await page.selectOption('[name="protocolType"]', 'human_subjects');
    await page.click('button[type="submit"]');

    // Verify redirect to session page
    await expect(page).toHaveURL(/\/sessions\/sess_/);
    await expect(page.locator('h1')).toContainText('My Research Protocol');
  });

  test('user can interact with AI assistant', async ({ page }) => {
    // Navigate to existing session
    await page.goto('/sessions/sess_test123');

    // Send message
    await page.fill('[name="message"]', 'What should I include in the methodology?');
    await page.click('button[aria-label="Send message"]');

    // Wait for AI response
    await expect(page.locator('.message.assistant')).toBeVisible({
      timeout: 30000,
    });
    await expect(page.locator('.message.assistant')).toContainText('methodology');
  });

  test('user can export protocol as PDF', async ({ page }) => {
    await page.goto('/sessions/sess_test123');

    // Start download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button[aria-label="Export PDF"]'),
    ]);

    // Verify download
    expect(download.suggestedFilename()).toContain('.pdf');
  });
});
```

## Mocking LLM Responses

### LLM Mock Factory

```python
# tests/mocks/llm.py
from typing import AsyncIterator
from dataclasses import dataclass

@dataclass
class MockLLMResponse:
    content: str
    model: str = "mock-model"
    input_tokens: int = 100
    output_tokens: int = 200
    finish_reason: str = "stop"

class MockLLMProvider:
    """Mock LLM provider for testing."""

    def __init__(self, responses: dict[str, str] | None = None):
        self.responses = responses or {}
        self.calls: list[dict] = []

    async def complete(
        self,
        messages: list,
        system_prompt: str,
        **kwargs,
    ) -> MockLLMResponse:
        """Return mocked completion."""
        self.calls.append({
            "messages": messages,
            "system_prompt": system_prompt,
            "kwargs": kwargs,
        })

        # Find matching response
        last_message = messages[-1].content if messages else ""
        for pattern, response in self.responses.items():
            if pattern.lower() in last_message.lower():
                return MockLLMResponse(content=response)

        # Default response
        return MockLLMResponse(
            content="This is a mock LLM response for testing purposes."
        )

    async def stream(
        self,
        messages: list,
        system_prompt: str,
        **kwargs,
    ) -> AsyncIterator[str]:
        """Stream mocked completion."""
        response = await self.complete(messages, system_prompt, **kwargs)
        for word in response.content.split():
            yield word + " "
```

### Using LLM Mocks

```python
# tests/unit/services/test_generation_service.py
import pytest
from tests.mocks.llm import MockLLMProvider
from app.services.generation import GenerationService

class TestGenerationService:
    """Tests for GenerationService with mocked LLM."""

    @pytest.fixture
    def mock_llm(self):
        """Create mock LLM with predefined responses."""
        return MockLLMProvider(responses={
            "methodology": "## Methodology\n\nThis study uses a randomized design...",
            "consent": "## Informed Consent\n\nParticipants will be informed...",
            "risk": "## Risk Assessment\n\nMinimal risk study...",
        })

    @pytest.fixture
    def service(self, mock_llm, mock_db):
        """Create GenerationService with mocks."""
        return GenerationService(llm=mock_llm, db=mock_db)

    async def test_generate_section_uses_correct_prompt(
        self,
        service,
        mock_llm,
    ):
        """Generation should include section type in prompt."""
        await service.generate_section("sess_123", "methodology")

        assert len(mock_llm.calls) == 1
        call = mock_llm.calls[0]
        assert "methodology" in call["system_prompt"].lower()

    async def test_generate_section_returns_formatted_content(
        self,
        service,
    ):
        """Generation should return properly formatted content."""
        result = await service.generate_section("sess_123", "methodology")

        assert "## Methodology" in result.content
        assert "randomized" in result.content.lower()
```

### VCR-style Recording

```python
# tests/fixtures/llm_responses.py
"""
Pre-recorded LLM responses for deterministic testing.
"""

LLM_RESPONSES = {
    "methodology_generation": {
        "prompt_contains": "generate methodology section",
        "response": """## Methodology

### Study Design
This study employs a randomized controlled trial design to evaluate...

### Participants
Participants will be recruited from the university community...

### Procedures
The study will follow a three-phase protocol:
1. Baseline assessment
2. Intervention period
3. Follow-up evaluation
""",
    },
    "compliance_check": {
        "prompt_contains": "check compliance",
        "response": """{
    "compliant": true,
    "issues": [],
    "recommendations": [
        "Consider adding more detail to the consent process"
    ]
}""",
    },
}
```

## Test Configuration

### pytest Configuration

```ini
# pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "--strict-markers",
    "-v",
    "--tb=short",
]
markers = [
    "slow: marks tests as slow",
    "integration: marks tests as integration tests",
    "e2e: marks tests as end-to-end tests",
]
```

### Jest Configuration

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 2,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

## Running Tests

### Backend Tests

```bash
# Run all tests
cd backend
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/unit/services/test_session_service.py

# Run specific test
pytest tests/unit/services/test_session_service.py::TestSessionService::test_create_session

# Run only unit tests
pytest tests/unit/

# Run only integration tests
pytest tests/integration/ -m integration

# Run in parallel
pytest -n auto
```

### Frontend Tests

```bash
# Run all tests
cd frontend
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run specific test file
npm test -- SessionCard.test.tsx
```

### E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run with UI mode
npx playwright test --ui

# Run specific test file
npx playwright test sessions.spec.ts

# Debug mode
npx playwright test --debug
```

## Coverage Requirements

### Minimum Coverage

| Component | Lines | Branches | Functions |
|-----------|-------|----------|-----------|
| New code | 80% | 80% | 80% |
| Critical paths | 90% | 90% | 90% |
| Utilities | 90% | 90% | 90% |

### Generating Coverage Reports

```bash
# Python
pytest --cov=app --cov-report=html
open htmlcov/index.html

# JavaScript
npm run test:coverage
open coverage/lcov-report/index.html
```

### Coverage Exclusions

```python
# pragma: no cover - for code that shouldn't be covered
if TYPE_CHECKING:  # pragma: no cover
    from app.types import SomeType
```

```typescript
/* istanbul ignore next */
function debugOnly() {
  // Development-only code
}
```

---

*Questions about testing? Open a discussion on GitHub.*
