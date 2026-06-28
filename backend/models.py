from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4
from sqlmodel import Field, SQLModel

def _uuid4() -> str:
    return str(uuid4())
def _now() -> datetime:
    return datetime.now(timezone.utc)
    
class Job(SQLModel, table=True):
    id: str = Field(default_factory=_uuid4, primary_key=True)
    prompt: str = Field(default="")
    num_thumbnails: int = Field(default=0)
    headshot_url: str = Field(default="")
    
    status: str = Field(default="uploaded")
    error_message: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)

class Thumbnail(SQLModel, table=True):
    id: str = Field(default_factory=_uuid4, primary_key=True) 
    job_id: str = Field(foreign_key="job.id")
    style_name: str = Field(default="")
    status: str = Field(default="uploaded")
    error_message: Optional[str] = Field(default=None)
    imagekit_url: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=_now)
    updated_at: datetime = Field(default_factory=_now)
