"""In-process thread-safe token bucket rate limiter per client."""

import math
import threading
import time
import uuid

from app.config import settings


class TokenBucket:
    """Token bucket algorithm implementation for rate limiting."""

    def __init__(self, rate_per_sec: float):
        self.rate = max(float(rate_per_sec), 1.0)
        self.capacity = self.rate  # Max burst capacity equals rate per second
        self.tokens = self.capacity
        self.last_update = time.monotonic()
        self.lock = threading.Lock()

    def update_rate(self, new_rate: float) -> None:
        """Dynamically adjusts the rate and capacity if client settings change."""
        with self.lock:
            self.rate = max(float(new_rate), 1.0)
            self.capacity = self.rate
            if self.tokens > self.capacity:
                self.tokens = self.capacity

    def consume(self, count: float = 1.0) -> tuple[bool, int]:
        """Attempts to consume token(s).
        
        Returns:
            tuple (allowed: bool, retry_after_seconds: int)
        """
        with self.lock:
            now = time.monotonic()
            elapsed = now - self.last_update
            self.last_update = now

            # Replenish tokens based on elapsed time
            self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)

            if self.tokens >= count:
                self.tokens -= count
                return True, 0

            # Calculate seconds to wait until at least 1 token is available
            deficit = count - self.tokens
            retry_after = max(1, math.ceil(deficit / self.rate))
            return False, retry_after


class RateLimiter:
    """Manages token buckets for all active clients in-process."""

    def __init__(self):
        self._buckets: dict[uuid.UUID, TokenBucket] = {}
        self._lock = threading.Lock()

    def check(self, client_id: uuid.UUID, rate_limit_per_sec: int | None = None) -> tuple[bool, int]:
        """Checks and consumes a token for the specified client.
        
        Returns:
            tuple (allowed: bool, retry_after: int)
        """
        rate = rate_limit_per_sec or settings.DEFAULT_RATE_LIMIT_PER_SEC

        with self._lock:
            bucket = self._buckets.get(client_id)
            if bucket is None:
                bucket = TokenBucket(rate_per_sec=rate)
                self._buckets[client_id] = bucket
            elif bucket.rate != rate:
                bucket.update_rate(rate)

        return bucket.consume(1.0)

    def reset_client(self, client_id: uuid.UUID) -> None:
        """Clears client bucket (useful for testing)."""
        with self._lock:
            self._buckets.pop(client_id, None)


rate_limiter = RateLimiter()
