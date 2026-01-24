# Contributing Guide

Thank you for your interest in contributing to the Radiology Research Platform! This document provides guidelines for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Documentation Requirements](#documentation-requirements)
- [Issue Guidelines](#issue-guidelines)
- [Protocol Assistant Development](#protocol-assistant-development)

## Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please:

- Be respectful and considerate
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect differing viewpoints and experiences

## Getting Started

### Finding Issues

1. Check the issue tracker for open issues
2. Look for issues labeled `good first issue` if you're new
3. Check `help wanted` for issues where help is needed
4. Review the project roadmap for upcoming features

### Claiming an Issue

1. Comment on the issue to express interest
2. Wait for maintainer assignment
3. Ask questions if requirements are unclear
4. Provide updates if you need more time

## Development Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker and Docker Compose
- Git

### Local Setup

1. **Fork the repository**
   ```bash
   # Click "Fork" on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/radiology-research-platform.git
   cd radiology-research-platform
   ```

2. **Add upstream remote**
   ```bash
   git remote add upstream https://github.com/ORIGINAL_OWNER/radiology-research-platform.git
   ```

3. **Create virtual environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   # or: venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

4. **Install frontend dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

5. **Copy environment configuration**
   ```bash
   cp env.example .env
   # Edit .env with your settings
   ```

6. **Start development services**
   ```bash
   docker-compose up -d db redis
   cd backend && alembic upgrade head
   ```

7. **Run development servers**
   ```bash
   # Terminal 1: Backend
   cd backend
   uvicorn app.main:app --reload

   # Terminal 2: Frontend
   cd frontend
   npm run dev
   ```

### Development Ports

| Service | Port |
|---------|------|
| Frontend | 5174 |
| Gateway | 3001 |
| Forms Service | 8001 |
| Protocol Assistant | 8002 |
| Database | 5434 |

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates

### Creating a Branch

```bash
# Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

# Create feature branch
git checkout -b feature/your-feature-name
```

## Code Style

### General Principles

- Write clear, self-documenting code
- Prefer explicit over implicit
- Keep functions small and focused
- Use meaningful variable and function names
- Add comments for complex logic

### Python Style

Follow [PEP 8](https://pep8.org/) with these additions:

```python
# Good: Type hints for all functions
def create_session(
    user_id: str,
    protocol_type: str,
    title: str,
) -> ProtocolSession:
    """Create a new protocol session.

    Args:
        user_id: The ID of the user creating the session.
        protocol_type: Type of protocol (e.g., 'human_subjects').
        title: Title of the protocol.

    Returns:
        The newly created ProtocolSession.

    Raises:
        ValidationError: If input validation fails.
    """
    ...

# Good: Descriptive variable names
session_messages = await get_session_messages(session_id)
filtered_messages = [m for m in session_messages if m.role == "user"]

# Bad: Unclear abbreviations
sm = await gsm(sid)
fm = [m for m in sm if m.r == "u"]
```

### TypeScript Style

```typescript
// Good: Interface definitions
interface ProtocolSession {
  id: string;
  userId: string;
  title: string;
  status: SessionStatus;
  createdAt: Date;
}

// Good: Explicit typing
function createSession(
  userId: string,
  options: CreateSessionOptions
): Promise<ProtocolSession> {
  // ...
}

// Good: Use async/await
async function fetchSession(sessionId: string): Promise<ProtocolSession> {
  const response = await api.get(`/sessions/${sessionId}`);
  return response.data;
}
```

### Linting and Formatting

```bash
# Python
cd backend
ruff check .
ruff format .
mypy .

# TypeScript
cd frontend
npm run lint
npm run format
```

See [Code Style Guide](./CODE_STYLE.md) for complete details.

## Pull Request Process

### Before Opening a PR

1. Ensure all tests pass locally
2. Run linters and formatters
3. Update documentation if needed
4. Write meaningful commit messages

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Formatting, no code change
- `refactor` - Refactoring code
- `test` - Adding tests
- `chore` - Maintenance tasks

Examples:
```bash
feat(sessions): add session archiving functionality

fix(auth): correct JWT token refresh logic

docs(api): update session endpoints documentation

test(generation): add unit tests for compliance checker
```

### Creating a Pull Request

1. **Push your branch**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open PR on GitHub**
   - Use a clear, descriptive title
   - Fill out the PR template completely
   - Link related issues

3. **PR Description Template**
   ```markdown
   ## Summary
   Brief description of changes

   ## Changes
   - Change 1
   - Change 2

   ## Testing
   How to test these changes

   ## Screenshots (if applicable)
   Add screenshots for UI changes

   ## Checklist
   - [ ] Tests added/updated
   - [ ] Documentation updated
   - [ ] Lint passes
   - [ ] Self-reviewed
   ```

### Review Process

1. Maintainers will review your PR
2. Address feedback promptly
3. Keep PR focused on a single change
4. Squash commits if requested
5. Once approved, maintainer will merge

### After Merge

```bash
# Delete local branch
git checkout main
git branch -d feature/your-feature-name

# Sync with upstream
git fetch upstream
git merge upstream/main
```

## Testing Requirements

### Required Test Coverage

| Component | Minimum Coverage |
|-----------|------------------|
| New code | 80% |
| Critical paths | 90% |
| API endpoints | 100% |

### Types of Tests

1. **Unit Tests** - Required for all new functions
2. **Integration Tests** - Required for API endpoints
3. **E2E Tests** - Required for critical user flows

### Running Tests

```bash
# Backend tests
cd backend
pytest
pytest --cov=app  # with coverage

# Frontend tests
cd frontend
npm test
npm run test:coverage

# E2E tests
npm run test:e2e
```

### Writing Tests

```python
# Good: Descriptive test name
def test_create_session_returns_session_with_correct_status():
    # Arrange
    user = create_test_user()

    # Act
    session = create_session(user.id, "human_subjects", "Test Protocol")

    # Assert
    assert session.status == SessionStatus.ACTIVE
    assert session.user_id == user.id
```

See [Testing Guide](./TESTING.md) for complete details.

## Documentation Requirements

### When to Update Documentation

- Adding new features
- Changing API endpoints
- Modifying configuration options
- Updating deployment procedures

### Documentation Checklist

- [ ] README.md updated if needed
- [ ] API documentation updated
- [ ] Code comments for complex logic
- [ ] Environment variables documented
- [ ] Migration notes for breaking changes

### Documentation Standards

- Use clear, concise language
- Include code examples
- Keep formatting consistent
- Link to related documentation
- Test all code examples

## Issue Guidelines

### Bug Reports

Use the bug report template:

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- OS: [e.g., Ubuntu 22.04]
- Browser: [e.g., Chrome 120]
- Version: [e.g., 1.2.0]

## Additional Context
Screenshots, logs, etc.
```

### Feature Requests

Use the feature request template:

```markdown
## Problem Statement
Describe the problem this feature would solve

## Proposed Solution
Describe your proposed solution

## Alternatives Considered
Other solutions you've considered

## Additional Context
Any other context or screenshots
```

### Questions

- Check documentation first
- Search existing issues
- Use the Discussions tab for questions
- Tag with `question` label

## Recognition

Contributors are recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

## Protocol Assistant Development

The Protocol Assistant is an LLM-powered service that helps users create and manage research protocols.

### Service Structure

- **Location:** `protocol-assistant/`
- **Framework:** FastAPI with async SQLAlchemy
- **Language:** Python 3.11+

### Adding New LLM Features

1. **Add prompts** in `app/services/prompts/`
2. **Implement service logic** in `app/services/`
3. **Add API routes** in `app/routers/`
4. **Update schemas** in `app/schemas/`

### Testing

```bash
# Unit tests
pytest protocol-assistant/tests/

# Integration tests require LLM API keys
# Mock LLM responses for CI
```

### Database Migrations

```bash
# Create a new migration
alembic revision --autogenerate -m "description"

# Apply migrations
alembic upgrade head

# Test migration (downgrade and upgrade)
alembic downgrade -1 && alembic upgrade head
```

### Code Style

- Use **black** for formatting
- Use **mypy** for type checking
- Follow existing patterns in the codebase

Thank you for contributing to the Radiology Research Platform!

---

*Questions about contributing? Open a discussion on GitHub.*
