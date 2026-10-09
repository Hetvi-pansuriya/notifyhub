"""Management business logic service for recipients, preferences, templates, and event types."""

import uuid
from typing import Any, Optional
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import EventTypeSetting, NotificationEvent, Preference, Recipient, Template
from app.schemas.event_types import EventTypeSettingUpsert
from app.schemas.recipients import RecipientResponse, RecipientUpsert
from app.schemas.templates import TemplateCreate, TemplateUpdate
from app.services.rendering import render


# =====================================================================
# RECIPIENTS & PREFERENCES
# =====================================================================

def upsert_recipient(
    db: Session, client_id: uuid.UUID, external_id: str, data: RecipientUpsert
) -> RecipientResponse:
    """Creates or updates a recipient for a specific client tenant."""
    recipient = (
        db.query(Recipient)
        .filter(Recipient.client_id == client_id, Recipient.external_id == external_id)
        .first()
    )

    if recipient is None:
        recipient = Recipient(
            client_id=client_id,
            external_id=external_id,
            name=data.name,
            email=data.email,
        )
        db.add(recipient)
    else:
        recipient.name = data.name
        recipient.email = data.email

    db.commit()
    db.refresh(recipient)

    return get_recipient(db, client_id, external_id)


def get_recipient(db: Session, client_id: uuid.UUID, external_id: str) -> RecipientResponse:
    """Retrieves a recipient along with their opt-out preferences. Returns 404 if not found."""
    recipient = (
        db.query(Recipient)
        .filter(Recipient.client_id == client_id, Recipient.external_id == external_id)
        .first()
    )

    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipient not found",
        )

    # Opt-outs are event types where enabled is explicitly False
    opt_outs = [p.event_type for p in recipient.preferences if not p.enabled]

    return RecipientResponse(
        id=recipient.id,
        external_id=recipient.external_id,
        name=recipient.name,
        email=recipient.email,
        opt_outs=opt_outs,
        preferences=recipient.preferences,
        created_at=recipient.created_at,
        updated_at=recipient.updated_at,
    )


def list_recipients(
    db: Session,
    client_id: uuid.UUID,
    search: Optional[str] = None,
    limit: Optional[int] = None,
    offset: Optional[int] = None,
) -> list[RecipientResponse]:
    """Lists all recipients for a client along with their opt-out preferences, supporting search and paging."""
    query = db.query(Recipient).filter(Recipient.client_id == client_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Recipient.name.ilike(term)) | (Recipient.email.ilike(term)) | (Recipient.external_id.ilike(term))
        )
    query = query.order_by(Recipient.created_at.desc())
    if offset is not None:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    recipients = query.all()
    result = []
    for r in recipients:
        opt_outs = [p.event_type for p in r.preferences if not p.enabled]
        result.append(
            RecipientResponse(
                id=r.id,
                external_id=r.external_id,
                name=r.name,
                email=r.email,
                opt_outs=opt_outs,
                preferences=r.preferences,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )
    return result


def set_recipient_preference(
    db: Session, client_id: uuid.UUID, external_id: str, event_type: str, enabled: bool
) -> RecipientResponse:
    """Sets opt-in/opt-out status for an event type for a recipient."""
    recipient = (
        db.query(Recipient)
        .filter(Recipient.client_id == client_id, Recipient.external_id == external_id)
        .first()
    )

    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recipient not found",
        )

    preference = (
        db.query(Preference)
        .filter(
            Preference.recipient_id == recipient.id,
            Preference.event_type == event_type,
        )
        .first()
    )

    if preference is None:
        preference = Preference(
            recipient_id=recipient.id,
            event_type=event_type,
            enabled=enabled,
        )
        db.add(preference)
    else:
        preference.enabled = enabled

    db.commit()
    return get_recipient(db, client_id, external_id)


# =====================================================================
# TEMPLATES
# =====================================================================

def create_template_draft(
    db: Session, client_id: uuid.UUID, data: TemplateCreate
) -> Template:
    """Creates a new template in 'draft' status with the next incrementing version number.
    
    If the event type has no settings yet for this client, creates defaults:
    priority: 1 (normal), ttl: None, retry_schedule: [5, 10, 20, 40], respect_opt_out: True, sensitive: False.
    """
    # Calculate next version for this client and event_type
    max_version = (
        db.query(func.max(Template.version))
        .filter(Template.client_id == client_id, Template.event_type == data.event_type)
        .scalar()
    )
    next_version = (max_version or 0) + 1

    template = Template(
        client_id=client_id,
        event_type=data.event_type,
        version=next_version,
        subject=data.subject,
        body=data.body,
        status="draft",
    )
    db.add(template)

    # Check if event type settings exist for this client
    event_setting = (
        db.query(EventTypeSetting)
        .filter(
            EventTypeSetting.client_id == client_id,
            EventTypeSetting.event_type == data.event_type,
        )
        .first()
    )

    if event_setting is None:
        # Create default settings for this event type
        default_setting = EventTypeSetting(
            client_id=client_id,
            event_type=data.event_type,
            priority=1,  # normal
            ttl_seconds=None,
            retry_schedule=[5, 10, 20, 40],
            respect_opt_out=True,
            sensitive=False,
        )
        db.add(default_setting)

    db.commit()
    db.refresh(template)
    return template


def list_templates(db: Session, client_id: uuid.UUID) -> list[Template]:
    """Lists all templates and versions for this client tenant, seeding clean defaults if none exist."""
    existing = (
        db.query(Template)
        .filter(Template.client_id == client_id)
        .order_by(Template.event_type.asc(), Template.version.desc())
        .all()
    )
    if not existing:
        core_templates = [
            {
                "event_type": "otp",
                "version": 1,
                "subject": "Your OTP code is {{ otp_code }}",
                "body": "Hello {{ name }},\n\nYour one-time verification code is {{ otp_code }}. This code will expire in 5 minutes.\n\nDo not share this code with anyone.",
                "status": "active",
            },
            {
                "event_type": "welcome_email",
                "version": 1,
                "subject": "Welcome to {{ app_name }}, {{ name }}!",
                "body": "Hello {{ name }},\n\nWelcome to {{ app_name }}! We are delighted to have you on board. Let us know if you need any assistance.",
                "status": "active",
            },
            {
                "event_type": "report_email",
                "version": 1,
                "subject": "{{ report_title }} for {{ period }}",
                "body": "Hello {{ name }},\n\nYour scheduled {{ report_title }} for {{ period }} is ready.\n\nSummary:\n{{ summary }}\n\nBest regards,\nYour Operations Team",
                "status": "active",
            },
            {
                "event_type": "password_reset",
                "version": 1,
                "subject": "Reset your password",
                "body": "Hello {{ name }},\n\nClick the link below to reset your password:\n{{ reset_url }}\n\nThis link expires in 15 minutes.",
                "status": "draft",
            },
        ]
        for tmpl_data in core_templates:
            t = Template(client_id=client_id, **tmpl_data)
            db.add(t)
            existing.append(t)
        db.commit()
    return sorted(existing, key=lambda t: (t.event_type, -t.version))


def preview_template(
    subject: str, body: str, sample_data: dict[str, Any]
) -> tuple[str, str]:
    """Renders a template without saving. Raises 422 if variables are missing or syntax is invalid."""
    return render(subject, body, sample_data)


def activate_template(
    db: Session, client_id: uuid.UUID, template_id: uuid.UUID
) -> Template:
    """Activates a template in ONE transaction: archives previous active version and activates this one."""
    template = (
        db.query(Template)
        .filter(Template.client_id == client_id, Template.id == template_id)
        .first()
    )

    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    # In ONE transaction: Archive any currently active template for this event type
    db.query(Template).filter(
        Template.client_id == client_id,
        Template.event_type == template.event_type,
        Template.status == "active",
        Template.id != template.id,
    ).update({"status": "archived"}, synchronize_session=False)

    template.status = "active"
    db.commit()
    db.refresh(template)
    return template


def update_template(
    db: Session,
    client_id: uuid.UUID,
    template_id: uuid.UUID,
    data: TemplateUpdate,
) -> Template:
    """Updates subject/body of a template, or activates it in one transaction."""
    template = (
        db.query(Template)
        .filter(Template.client_id == client_id, Template.id == template_id)
        .first()
    )
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        )

    if data.subject is not None:
        template.subject = data.subject
    if data.body is not None:
        template.body = data.body
    if data.status is not None:
        if data.status == "active":
            db.query(Template).filter(
                Template.client_id == client_id,
                Template.event_type == template.event_type,
                Template.status == "active",
                Template.id != template.id,
            ).update({"status": "archived"}, synchronize_session=False)
        template.status = data.status

    db.commit()
    db.refresh(template)
    return template


# =====================================================================
# EVENT TYPE SETTINGS
# =====================================================================

def list_event_type_settings(
    db: Session, client_id: uuid.UUID
) -> list[EventTypeSetting]:
    """Lists all event type settings for this client tenant, ensuring core types and discovering any from templates."""
    existing_settings = (
        db.query(EventTypeSetting)
        .filter(EventTypeSetting.client_id == client_id)
        .all()
    )
    existing_types = {s.event_type for s in existing_settings}

    core_defaults = [
        {"event_type": "otp", "priority": 2, "ttl_seconds": 300, "retry_schedule": [2, 5], "respect_opt_out": False, "sensitive": True},
        {"event_type": "password_reset", "priority": 2, "ttl_seconds": 900, "retry_schedule": [5, 10], "respect_opt_out": False, "sensitive": True},
        {"event_type": "welcome_email", "priority": 1, "ttl_seconds": None, "retry_schedule": [5, 10, 20], "respect_opt_out": True, "sensitive": False},
        {"event_type": "report_email", "priority": 0, "ttl_seconds": 172800, "retry_schedule": [60, 300], "respect_opt_out": True, "sensitive": False},
    ]

    for item in core_defaults:
        if item["event_type"] not in existing_types:
            new_s = EventTypeSetting(
                client_id=client_id,
                event_type=item["event_type"],
                priority=item["priority"],
                ttl_seconds=item["ttl_seconds"],
                retry_schedule=item["retry_schedule"],
                respect_opt_out=item["respect_opt_out"],
                sensitive=item["sensitive"],
            )
            db.add(new_s)
            existing_settings.append(new_s)
            existing_types.add(item["event_type"])

    # Discover other event types from templates
    template_types = (
        db.query(Template.event_type)
        .filter(Template.client_id == client_id)
        .distinct()
        .all()
    )
    for (t_name,) in template_types:
        if t_name and t_name not in existing_types:
            new_s = EventTypeSetting(
                client_id=client_id,
                event_type=t_name,
                priority=1,
                retry_schedule=[60, 300, 900],
                respect_opt_out=True,
                sensitive=False,
            )
            db.add(new_s)
            existing_settings.append(new_s)
            existing_types.add(t_name)

    # Discover other event types from notification_events
    event_types = (
        db.query(NotificationEvent.event_type)
        .filter(NotificationEvent.client_id == client_id)
        .distinct()
        .all()
    )
    for (e_name,) in event_types:
        if e_name and e_name not in existing_types:
            new_s = EventTypeSetting(
                client_id=client_id,
                event_type=e_name,
                priority=1,
                retry_schedule=[60, 300, 900],
                respect_opt_out=True,
                sensitive=False,
            )
            db.add(new_s)
            existing_settings.append(new_s)
            existing_types.add(e_name)

    if db.dirty:
        db.commit()

    return sorted(existing_settings, key=lambda s: (-s.priority, s.event_type))


def upsert_event_type_setting(
    db: Session, client_id: uuid.UUID, event_type: str, data: EventTypeSettingUpsert
) -> EventTypeSetting:
    """Creates or updates event type configuration settings for a client tenant."""
    setting = (
        db.query(EventTypeSetting)
        .filter(
            EventTypeSetting.client_id == client_id,
            EventTypeSetting.event_type == event_type,
        )
        .first()
    )

    priority_int = int(data.priority)

    if setting is None:
        setting = EventTypeSetting(
            client_id=client_id,
            event_type=event_type,
            priority=priority_int,
            ttl_seconds=data.ttl_seconds,
            retry_schedule=data.retry_schedule,
            respect_opt_out=data.respect_opt_out,
            sensitive=data.sensitive,
        )
        db.add(setting)
    else:
        setting.priority = priority_int
        setting.ttl_seconds = data.ttl_seconds
        setting.retry_schedule = data.retry_schedule
        setting.respect_opt_out = data.respect_opt_out
        setting.sensitive = data.sensitive

    db.commit()
    db.refresh(setting)
    return setting
