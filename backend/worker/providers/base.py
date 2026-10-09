"""Abstract provider interface and outcome classification for email dispatch."""

import abc
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class ProviderOutcome(str, Enum):
    SUCCESS = "success"
    TEMPORARY_ERROR = "temporary_error"
    PERMANENT_ERROR = "permanent_error"


@dataclass
class ProviderResult:
    outcome: ProviderOutcome
    error_message: Optional[str] = None
    provider_message_id: Optional[str] = None
    provider_response: Optional[str] = None


class BaseEmailProvider(abc.ABC):
    """Abstract interface for email delivery providers."""
    provider_name: str = "base"

    @abc.abstractmethod
    def send(
        self,
        to: str,
        subject: str,
        body: str,
        message_id: str,
        from_name: str,
        reply_to: Optional[str] = None,
        **kwargs,
    ) -> ProviderResult:
        """Dispatches an email and classifies the outcome."""
        pass
