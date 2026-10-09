"""Email templates management API endpoints."""

import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import get_current_client
from app.models import Client
from app.schemas.templates import (
    TemplateCreate,
    TemplateUpdate,
    TemplatePreview,
    TemplatePreviewResponse,
    TemplateResponse,
    TemplateVariablesRequest,
    TemplateVariablesResponse,
)
from app.services import management as mgmt_service
from fastapi.responses import JSONResponse

router = APIRouter(
    prefix="/api/templates",
    tags=["Templates"],
)


@router.post(
    "/variables",
    response_model=TemplateVariablesResponse,
    summary="Detect variables used in template",
    description="Returns undeclared variable names parsed from subject and body templates.",
)
def detect_template_variables(
    data: TemplateVariablesRequest,
    current_client: Client = Depends(get_current_client),
):
    from app.services.rendering import find_template_variables
    vars_list = find_template_variables(data.subject, data.body)
    return TemplateVariablesResponse(variables=vars_list)


@router.post(
    "",
    response_model=TemplateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new template draft",
    description="Saves a template DRAFT with the next incrementing version number for that event type.",
)
def create_template(
    data: TemplateCreate,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.create_template_draft(
        db=db,
        client_id=current_client.id,
        data=data,
    )


@router.get(
    "",
    response_model=list[TemplateResponse],
    summary="List templates",
    description="Returns all templates and their versions for the calling client.",
)
def list_templates(
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.list_templates(
        db=db,
        client_id=current_client.id,
    )


@router.post(
    "/preview",
    response_model=TemplatePreviewResponse,
    summary="Preview a template draft without saving",
    description="Renders subject and body with sample data. Fails with 422 on syntax or missing variable errors.",
)
def preview_template(
    data: TemplatePreview,
    current_client: Client = Depends(get_current_client),
):
    from app.services.rendering import find_template_variables, render
    declared_vars = find_template_variables(data.subject, data.body)
    missing = [v for v in declared_vars if v not in data.sample_data]
    if missing:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": f"Missing variable: {missing[0]}",
                "missing": missing,
            },
        )

    try:
        rendered_subject, rendered_body = render(
            subject_template_str=data.subject,
            body_template_str=data.body,
            data=data.sample_data,
        )
        return TemplatePreviewResponse(
            rendered_subject=rendered_subject,
            rendered_body=rendered_body,
        )
    except HTTPException as e:
        import re
        err_msg = str(e.detail)
        var_match = re.search(r"'([^']+)' is undefined", err_msg)
        var_name = var_match.group(1) if var_match else "unknown"
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "detail": f"Missing variable: {var_name}",
                "missing": [var_name],
            },
        )


@router.post(
    "/{template_id}/activate",
    response_model=TemplateResponse,
    summary="Activate a template version",
    description="In ONE transaction, archives the previous active version and marks this template active.",
)
def activate_template(
    template_id: uuid.UUID,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.activate_template(
        db=db,
        client_id=current_client.id,
        template_id=template_id,
    )


@router.patch(
    "/{template_id}",
    response_model=TemplateResponse,
    summary="Update an existing template",
    description="Updates subject/body or status of a template.",
)
def update_template(
    template_id: uuid.UUID,
    data: TemplateUpdate,
    current_client: Client = Depends(get_current_client),
    db: Session = Depends(get_db),
):
    return mgmt_service.update_template(
        db=db,
        client_id=current_client.id,
        template_id=template_id,
        data=data,
    )
