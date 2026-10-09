"""Application custom exceptions and error models."""

from fastapi import HTTPException, status


class DailyLimitExceeded(HTTPException):
    """Raised when tenant or global daily email limit is reached."""

    def __init__(
        self,
        retry_after_seconds: int,
        detail: str = "Daily sending limit reached",
    ):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(retry_after_seconds)},
        )
        self.retry_after_seconds = retry_after_seconds
