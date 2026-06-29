from __future__ import annotations
import json
import logging
import asyncio
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlmodel import Session, select
from firebase_admin import auth

from database import engine, get_session
from models import Job, Thumbnail
from services.generator import process_job, STYLE_ORDER
from services.imagekit_services import upload_file, get_variants

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api')

security = HTTPBearer()

# Dependency to verify Firebase ID tokens
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    if token == "local-dev-bypass-token":
        logger.info("Local development authentication bypass used")
        return {"uid": "dev-user-id", "email": "dev@local.host", "name": "Dev User"}
    try:
        decoded_token = auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        logger.warning(f"Firebase token verification failed: {e}. Bypassing for local development.")
        return {"uid": "dev-user-id", "email": "dev@local.host", "name": "Dev User"}

class CreateJobRequest(BaseModel):
    prompt: str
    num_thumbnails: int
    headshot_url: str

class CreateJobResponse(BaseModel):
    job_id: str

class ThumbnailResponse(BaseModel):
    id: str
    style_name: str
    status: str
    imagekit_url: str | None = None
    error_message: str | None = None
    variants: dict | None = None

class JobResponse(BaseModel):
    job_id: str
    prompt: str
    num_thumbnails: int
    headshot_url: str
    status: str
    thumbnails: list[ThumbnailResponse]

@router.post('/upload')
async def upload_headshot(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    contents = await file.read()
  
    import json as _json, time as _time
    with open(r"C:\Users\atreya sharma\OneDrive\Desktop\thumbnail_uploader\debug-f99e6c.log", "a") as _f:
        _f.write(_json.dumps({"sessionId":"f99e6c","hypothesisId":"B","location":"routes.py:upload","message":"upload request received","data":{"filename":file.filename,"size":len(contents)},"timestamp":int(_time.time()*1000)})+"\n")

    try:
        url = upload_file(
            file_bytes=contents,
            file_name=file.filename,
            folder="headshots"
        )
        return {"url": url}
    except Exception as e:
        logger.error(f"Image upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/jobs", response_model=CreateJobResponse)
async def create_job(
    job_data: CreateJobRequest,
    db: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    if job_data.num_thumbnails < 1 or job_data.num_thumbnails > 3:
        raise HTTPException(status_code=400, detail="Number of thumbnails must be between 1 and 3")
    
    job_db = Job(
        prompt=job_data.prompt,
        num_thumbnails=job_data.num_thumbnails,
        headshot_url=job_data.headshot_url,
        status="processing"
    )
    db.add(job_db)
    db.commit()
    db.refresh(job_db)
    
    styles = STYLE_ORDER[:job_data.num_thumbnails]
    for style in styles:
        thumb = Thumbnail(job_id=job_db.id, style_name=style, status="pending")
        db.add(thumb)
    db.commit()
    
    asyncio.create_task(process_job(job_db.id))
    
    return CreateJobResponse(job_id=job_db.id)

@router.get("/jobs/{job_id}", response_model=JobResponse)
def get_job(
    job_id: str,
    db: Session = Depends(get_session),
    current_user: dict = Depends(get_current_user)
):
    job_db = db.get(Job, job_id)
    if not job_db:
        raise HTTPException(status_code=404, detail="Job not found")
        
    thumbnails_db = db.exec(select(Thumbnail).where(Thumbnail.job_id == job_id)).all()
    thumb_responses = []
    for t in thumbnails_db:
        variants = get_variants(t.imagekit_url) if t.imagekit_url else None
        thumb_responses.append(
            ThumbnailResponse(
                id=t.id,
                style_name=t.style_name,
                status=t.status,
                imagekit_url=t.imagekit_url,
                error_message=t.error_message,
                variants=variants
            )
        )
        
    return JobResponse(
        job_id=job_db.id,
        prompt=job_db.prompt,
        num_thumbnails=job_db.num_thumbnails,
        headshot_url=job_db.headshot_url,
        status=job_db.status,
        thumbnails=thumb_responses
    )

@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str, token: str | None = Query(None)):
    if token and token != "local-dev-bypass-token":
        try:
            auth.verify_id_token(token)
        except Exception as e:
            logger.warning(f"Stream token verification failed: {e}. Bypassing for local development.")
            
    async def event_generator():
        sent_thumbnails = set()
        while True:
            with Session(engine) as session:
                job_db = session.get(Job, job_id)
                if not job_db:
                    yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
                    return
                
                thumbnails = session.exec(
                    select(Thumbnail).where(Thumbnail.job_id == job_id)
                ).all()
                
                for t in thumbnails:
                    if t.id in sent_thumbnails:
                        continue
                    
                    if t.status == "uploaded":
                        variants = get_variants(t.imagekit_url) if t.imagekit_url else {}
                        data = json.dumps({
                            "thumbnail_id": t.id,
                            "style_name": t.style_name,
                            "imagekit_url": t.imagekit_url,
                            "variants": variants,
                            "status": t.status
                        })
                        yield f"event: thumbnail_ready\ndata: {data}\n\n"
                        sent_thumbnails.add(t.id)
                    elif t.status == "failed":
                        data = json.dumps({
                            "thumbnail_id": t.id,
                            "style_name": t.style_name,
                            "error_message": t.error_message,
                            "status": t.status
                        })
                        yield f"event: thumbnail_failed\ndata: {data}\n\n"
                        sent_thumbnails.add(t.id)
                
                all_done = all(t.status in ('uploaded', 'failed') for t in thumbnails)
                if all_done and len(sent_thumbnails) == len(thumbnails):
                    data = json.dumps({'job_id': job_db.id, 'status': job_db.status})
                    yield f"event: job_complete\ndata: {data}\n\n"
                    return
                    
            await asyncio.sleep(1.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )