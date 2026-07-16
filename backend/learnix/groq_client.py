import os
import threading

from groq import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    Groq,
    InternalServerError,
    PermissionDeniedError,
    RateLimitError,
)


def _configured_keys():
    raw_keys = os.getenv("GROQ_API_KEYS", "")
    keys = [key.strip() for key in raw_keys.replace("\n", ",").split(",") if key.strip()]

    legacy_key = os.getenv("GROQ_API_KEY", "").strip()
    if legacy_key and legacy_key not in keys:
        keys.append(legacy_key)

    return keys


def _configured_fallback_models():
    raw_models = os.getenv(
        "GROQ_FALLBACK_MODELS",
        "llama-3.1-8b-instant,meta-llama/llama-4-scout-17b-16e-instruct,qwen/qwen3-32b",
    )
    return [model.strip() for model in raw_models.split(",") if model.strip()]


def _configured_timeout():
    try:
        return max(1.0, float(os.getenv("GROQ_TIMEOUT_SECONDS", "10")))
    except ValueError:
        return 10.0


def _configured_temporary_failure_limit():
    try:
        return max(1, int(os.getenv("GROQ_TEMPORARY_FAILURE_LIMIT", "2")))
    except ValueError:
        return 2


class GroqKeyPool:
    """Rotate Groq API keys when a key is rate-limited or no longer valid."""

    def __init__(self, keys=None):
        self._keys = list(keys if keys is not None else _configured_keys())
        self._active_index = 0
        self._lock = threading.Lock()

    @property
    def available(self):
        return bool(self._keys)

    @property
    def size(self):
        return len(self._keys)

    def _ordered_indexes(self):
        with self._lock:
            start = self._active_index
        return [(start + offset) % len(self._keys) for offset in range(len(self._keys))]

    def _activate(self, index):
        with self._lock:
            self._active_index = index

    def create_chat_completion(self, **kwargs):
        if not self._keys:
            raise RuntimeError("No Groq API key is configured")

        requested_model = kwargs.get("model")
        models = list(dict.fromkeys([requested_model, *_configured_fallback_models()]))
        last_rotation_error = None
        connection_failures = 0
        timeout = _configured_timeout()
        temporary_failure_limit = _configured_temporary_failure_limit()

        for model in models:
            for index in self._ordered_indexes():
                try:
                    completion = Groq(api_key=self._keys[index], timeout=timeout).chat.completions.create(
                        **{**kwargs, "model": model}
                    )
                    self._activate(index)
                    if model != requested_model:
                        print(f"GROQ MODEL FALLBACK: using {model}.", flush=True)
                    return completion
                except RateLimitError as exc:
                    last_rotation_error = exc
                    print(
                        f"GROQ KEY ROTATION: key {index + 1}/{len(self._keys)} is rate-limited "
                        f"for {model}; trying the next key.",
                        flush=True,
                    )
                except (AuthenticationError, PermissionDeniedError) as exc:
                    last_rotation_error = exc
                    print(
                        f"GROQ KEY ROTATION: key {index + 1}/{len(self._keys)} unavailable "
                        f"({exc.__class__.__name__}); trying the next key.",
                        flush=True,
                    )
                except (APIConnectionError, APITimeoutError, InternalServerError) as exc:
                    last_rotation_error = exc
                    connection_failures += 1
                    print(
                        f"GROQ TEMPORARY ERROR: {exc.__class__.__name__}; retrying with another key/model.",
                        flush=True,
                    )
                    if connection_failures >= temporary_failure_limit:
                        raise last_rotation_error

        raise last_rotation_error or RuntimeError("All configured Groq API keys are unavailable")


groq_key_pool = GroqKeyPool()


def groq_available():
    return groq_key_pool.available


def groq_chat_completion(**kwargs):
    return groq_key_pool.create_chat_completion(**kwargs)
