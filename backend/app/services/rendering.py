"""Jinja2 sandboxed template rendering service with strict variable enforcement."""

import re
from typing import Any
from fastapi import HTTPException, status
from jinja2 import StrictUndefined, TemplateError, TemplateSyntaxError, UndefinedError, meta
from jinja2.sandbox import SandboxedEnvironment

# Strict Sandboxed environment - any missing variable or unsafe attribute access fails
sandbox_env = SandboxedEnvironment(
    undefined=StrictUndefined,
    autoescape=False,
)


def find_template_variables(subject_template_str: str, body_template_str: str) -> list[str]:
    """Finds all undeclared variable names used across subject and body."""
    variables = set()
    if subject_template_str:
        try:
            parsed_subj = sandbox_env.parse(subject_template_str)
            variables.update(meta.find_undeclared_variables(parsed_subj))
        except Exception:
            pass
    if body_template_str:
        try:
            parsed_body = sandbox_env.parse(body_template_str)
            variables.update(meta.find_undeclared_variables(parsed_body))
        except Exception:
            pass
    return sorted(list(variables))


def render(subject_template_str: str, body_template_str: str, data: dict[str, Any]) -> tuple[str, str]:
    """Renders subject and body template strings using sandboxed Jinja2.
    
    Raises HTTPException(422) if:
    - A template variable is missing in data (StrictUndefined)
    - Template contains syntax errors
    - Template attempts unsafe attribute/method calls
    
    Returns:
        tuple (rendered_subject, rendered_body)
    """
    try:
        subject_tmpl = sandbox_env.from_string(subject_template_str)
        rendered_subject = subject_tmpl.render(**data)
    except UndefinedError as e:
        var_match = re.search(r"'([^']+)' is undefined", str(e))
        var_name = var_match.group(1) if var_match else "unknown"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Template rendering error in subject: missing variable - {str(e)}",
        )
    except TemplateSyntaxError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Template syntax error in subject at line {e.lineno}: {str(e)}",
        )
    except TemplateError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Template error in subject: {str(e)}",
        )

    try:
        body_tmpl = sandbox_env.from_string(body_template_str)
        rendered_body = body_tmpl.render(**data)
    except UndefinedError as e:
        var_match = re.search(r"'([^']+)' is undefined", str(e))
        var_name = var_match.group(1) if var_match else "unknown"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Template rendering error in body: missing variable - {str(e)}",
        )
    except TemplateSyntaxError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Template syntax error in body at line {e.lineno}: {str(e)}",
        )
    except TemplateError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Template error in body: {str(e)}",
        )

    return rendered_subject, rendered_body
