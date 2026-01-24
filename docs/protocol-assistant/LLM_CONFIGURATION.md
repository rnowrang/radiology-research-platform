# LLM Configuration Guide

This document provides comprehensive guidance for configuring LLM (Large Language Model) providers in the Protocol Assistant service.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Claude Configuration](#claude-configuration)
- [OpenAI Configuration](#openai-configuration)
- [Task Routing Configuration](#task-routing-configuration)
- [Fallback Behavior](#fallback-behavior)
- [Usage Examples](#usage-examples)
- [Cost Management](#cost-management)
- [Adding New Providers](#adding-new-providers)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Overview

The Protocol Assistant uses a provider-agnostic LLM abstraction layer that supports multiple AI providers. This enables:

- **Flexibility** - Choose the best provider for your needs
- **Reliability** - Automatic fallback if primary provider fails
- **Cost Optimization** - Route tasks to cost-effective models
- **Validation** - Pydantic schema validation of LLM outputs

### Supported Providers

| Provider | Status | Default Model |
|----------|--------|---------------|
| Anthropic (Claude) | Supported | claude-sonnet-4-20250514 |
| OpenAI | Supported | gpt-4o |
| Azure OpenAI | Planned | - |
| Local LLMs | Planned | - |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLM Orchestrator                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Validation  │  │    Retry     │  │      Fallback        │  │
│  │    Layer     │──│    Logic     │──│      Handler         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        LLM Router                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Task Routing │  │   Provider   │  │    Fallback Chain    │  │
│  │    Config    │──│   Registry   │──│                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
            │                │                    │
            ▼                ▼                    ▼
    ┌─────────────┐  ┌─────────────┐      ┌─────────────┐
    │   Claude    │  │   OpenAI    │      │   Future    │
    │   Provider  │  │   Provider  │      │   Provider  │
    └─────────────┘  └─────────────┘      └─────────────┘
```

## Quick Start

1. **Set API Keys** (at least one required):
   ```bash
   export CLAUDE_API_KEY=sk-ant-api03-xxxxx
   export OPENAI_API_KEY=sk-xxxxx
   ```

2. **Start the service**:
   ```bash
   cd protocol-assistant
   uvicorn app.main:app --reload
   ```

3. **Test the health endpoint**:
   ```bash
   curl http://localhost:8001/health
   ```

## Environment Variables

### Required API Keys

At least one API key must be configured:

```bash
# Claude (Anthropic) - Primary Provider
CLAUDE_API_KEY=sk-ant-api03-xxxxx

# OpenAI - Fallback Provider
OPENAI_API_KEY=sk-xxxxx
```

### Model Configuration

```bash
# Claude model (default: claude-sonnet-4-20250514)
CLAUDE_MODEL=claude-sonnet-4-20250514

# OpenAI model (default: gpt-4o)
OPENAI_MODEL=gpt-4o
```

### Provider Routing

```bash
# Default provider: claude or openai
DEFAULT_LLM_PROVIDER=claude

# Task-specific routing (JSON format)
LLM_TASK_ROUTING='{"protocol_generation": "claude", "summary": "openai"}'
```

### Other Settings

```bash
# Database connection
DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/protocol_assistant

# Forms service URL
FORMS_SERVICE_URL=http://localhost:8000

# Internal API key for service-to-service communication
INTERNAL_API_KEY=your-internal-key

# Storage path
STORAGE_PATH=/app/storage

# Logging
LOG_LEVEL=INFO
DEBUG=false
```

## Claude Configuration

### Basic Setup

1. **Obtain API Key**
   - Go to [console.anthropic.com](https://console.anthropic.com)
   - Create or select a project
   - Generate an API key

2. **Configure Environment Variables**
   ```bash
   CLAUDE_API_KEY=sk-ant-api03-xxxxx
   CLAUDE_MODEL=claude-sonnet-4-20250514
   DEFAULT_LLM_PROVIDER=claude
   ```

### Model Selection

| Model | Use Case | Relative Cost |
|-------|----------|---------------|
| claude-opus-4-20250514 | Complex reasoning, document generation | High |
| claude-sonnet-4-20250514 | Balanced performance (default) | Medium |
| claude-3-5-haiku-20241022 | Quick responses, simple tasks | Low |

## OpenAI Configuration

### Basic Setup

1. **Obtain API Key**
   - Go to [platform.openai.com](https://platform.openai.com)
   - Navigate to API keys
   - Create a new secret key

2. **Configure Environment Variables**
   ```bash
   OPENAI_API_KEY=sk-xxxxx
   OPENAI_MODEL=gpt-4o
   ```

### Model Selection

| Model | Use Case | Relative Cost |
|-------|----------|---------------|
| gpt-4o | Complex tasks, best quality | High |
| gpt-4o-mini | Balanced, most tasks | Medium |
| gpt-4-turbo | Long context needs | High |

## Task Routing Configuration

Different tasks can be routed to different providers for optimal performance and cost.

### Default Task Routing

| Task Type | Default Provider |
|-----------|------------------|
| `protocol_generation` | claude |
| `section_writing` | claude |
| `compliance_check` | claude |
| `risk_assessment` | claude |
| `summary` | openai |
| `translation` | openai |
| `default` | claude |

### Custom Task Routing

Override the defaults by setting `LLM_TASK_ROUTING` environment variable:

```bash
LLM_TASK_ROUTING='{"protocol_generation": "openai", "custom_task": "claude"}'
```

## Fallback Behavior

### Automatic Fallback

When the primary provider fails after retries, the system automatically falls back to an available secondary provider:

1. Primary request fails (rate limit, server error, etc.)
2. System retries with exponential backoff (up to 3 attempts)
3. If all retries fail, system switches to fallback provider
4. Fallback uses fresh conversation context

### Retry Logic

The system automatically retries on transient errors:
- **Rate limit errors**: Retries with exponential backoff
- **Server errors (5xx)**: Retries up to 3 times
- **Connection errors**: Retries with backoff

### Validation Retry

When using `generate_validated()`:
1. LLM generates response
2. JSON is extracted from response
3. Pydantic validates the JSON
4. On validation failure:
   - Error details are fed back to LLM
   - LLM is asked to correct the response
   - Up to 2 validation retries

## Usage Examples

### Basic Generation

```python
from app.services.llm import get_llm_orchestrator, LLMMessage

orchestrator = get_llm_orchestrator()

response = await orchestrator.generate(
    messages=[LLMMessage(role="user", content="Help me write a protocol")],
    system_prompt="You are an IRB protocol assistant.",
    task_type="protocol_generation",
)

print(response.content)
print(f"Model: {response.model}")
print(f"Tokens: {response.usage}")
```

### Validated Generation with Pydantic Schema

```python
from pydantic import BaseModel
from app.services.llm import get_llm_orchestrator, LLMMessage

class ProtocolSection(BaseModel):
    title: str
    content: str
    risk_level: str

orchestrator = get_llm_orchestrator()

section, response = await orchestrator.generate_validated(
    schema=ProtocolSection,
    messages=[LLMMessage(role="user", content="Generate study objectives section")],
    system_prompt="Generate a protocol section. Respond with JSON matching the schema.",
    task_type="section_writing",
)

print(f"Title: {section.title}")
print(f"Content: {section.content}")
print(f"Risk Level: {section.risk_level}")
```

### Using Specific Provider

```python
# Force use of OpenAI regardless of task routing
response = await orchestrator.generate(
    messages=[...],
    system_prompt="...",
    provider_name="openai",
)
```

### Streaming Responses

```python
from app.services.llm import get_llm_router, LLMMessage

router = get_llm_router()
provider = router.get_provider("claude")

async for chunk in provider.stream(
    messages=[LLMMessage(role="user", content="Explain IRB requirements")],
    system_prompt="You are a helpful assistant.",
):
    print(chunk, end="", flush=True)
```

## Cost Management

### Usage Tracking

Each `LLMResponse` includes usage information:

```python
response = await orchestrator.generate(...)
print(f"Input tokens: {response.usage.get('input_tokens')}")
print(f"Output tokens: {response.usage.get('output_tokens')}")
print(f"Total tokens: {response.usage.get('total_tokens')}")
```

### Cost Optimization Strategies

1. **Use task routing** to send simple tasks to cheaper models
2. **Configure temperature** appropriately (lower = more consistent, fewer retries)
3. **Use Haiku/Mini models** for classification and simple Q&A
4. **Monitor usage** and set alerts for unusual spikes

## Adding New Providers

To add a new LLM provider, implement the `BaseLLMProvider` interface:

### Provider Interface

```python
from app.services.llm.base import BaseLLMProvider, LLMMessage, LLMResponse
from typing import AsyncIterator

class CustomProvider(BaseLLMProvider):
    provider_name: str = "custom"

    async def complete(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> LLMResponse:
        # Implementation
        pass

    async def stream(
        self,
        messages: list[LLMMessage],
        system_prompt: str,
        max_tokens: int = 4096,
        temperature: float = 0.7,
    ) -> AsyncIterator[str]:
        # Implementation
        pass

    def is_available(self) -> bool:
        # Check if API key is configured
        return True
```

### Registration Steps

1. Create provider class in `app/services/llm/custom.py`
2. Add configuration to `app/config.py`
3. Register in `app/services/llm/router.py`
4. Export from `app/services/llm/__init__.py`

## Security Considerations

### API Key Management

```bash
# Never commit API keys to version control
# Use environment variables or secrets manager

# For production, use a secrets manager:
# - AWS Secrets Manager
# - HashiCorp Vault
# - Azure Key Vault
# - Google Secret Manager
```

### Request Security

- All LLM requests are logged for audit
- Sensitive data should be sanitized before sending to LLM
- API keys are never logged

## Troubleshooting

### Common Issues

#### "No LLM providers available"

Check that at least one API key is configured:
```bash
echo $CLAUDE_API_KEY
echo $OPENAI_API_KEY
```

#### Rate Limiting

If hitting rate limits frequently:
1. Implement request queuing in your application
2. Consider using different models for different tasks
3. Enable fallback to secondary provider

#### Validation Errors

If `generate_validated()` fails repeatedly:
1. Check that your Pydantic schema is well-defined
2. Ensure system prompt clearly describes expected JSON format
3. Consider lowering temperature for more consistent output

#### Timeout Errors

```bash
# Check provider connectivity
curl http://localhost:8001/health
```

### Error Handling

```python
from app.services.llm import LLMError, RateLimitError, AuthenticationError

try:
    response = await orchestrator.generate(...)
except AuthenticationError:
    # Invalid API key - check configuration
    pass
except RateLimitError as e:
    # Rate limit exceeded
    print(f"Retry after: {e.retry_after} seconds")
except LLMError as e:
    # General LLM error
    print(f"Provider: {e.provider}, Retryable: {e.retryable}")
```

### Debug Mode

Enable debug mode for detailed logging:

```bash
DEBUG=true
LOG_LEVEL=DEBUG
```

### Health Check

Verify service health:

```bash
curl http://localhost:8001/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "protocol-assistant",
  "version": "1.0.0"
}
```

---

*Last updated: Implementation by Agent A (LLM Integration)*
