"""Thin wrapper around the Anthropic SDK. Only computed facts / schema text are ever sent, never raw dataset rows."""
import json
import logging

import anthropic

from app.config import settings

log = logging.getLogger("app.ai")


class AiUnavailable(Exception):
    """No usable API key."""


class AiError(Exception):
    """The Claude call failed or returned something unusable."""


def available() -> bool:
    return bool(settings.anthropic_api_key)


def complete_json(system: str, user: str, schema: dict, max_tokens: int = 2000) -> dict:
    """One non-streaming call returning schema-constrained JSON (output_config.format)."""
    if not available():
        raise AiUnavailable("ANTHROPIC_API_KEY is not set")
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=settings.claude_timeout_seconds, max_retries=1)
    try:
        resp = client.messages.create(
            model=settings.claude_model, max_tokens=max_tokens, system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": schema}},
        )
    except anthropic.AuthenticationError as e:
        raise AiUnavailable("ANTHROPIC_API_KEY was rejected by the API") from e
    except anthropic.APIConnectionError as e:
        raise AiError("could not reach the Claude API") from e
    except anthropic.APIStatusError as e:
        raise AiError(f"Claude API error {e.status_code}") from e
    if resp.stop_reason == "refusal":
        raise AiError("the model declined this request")
    if resp.stop_reason == "max_tokens":
        raise AiError("the model response was cut off")
    text = next((b.text for b in resp.content if b.type == "text"), None)
    try:
        return json.loads(text)
    except (TypeError, ValueError) as e:
        raise AiError("the model did not return valid JSON") from e
