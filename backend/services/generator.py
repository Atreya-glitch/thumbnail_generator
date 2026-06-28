import asyncio
import logging

from sqlmodel import Session, select
from database import engine
from models import Job, Thumbnail
from services.openai_services import generate_thumbnail
from services.imagekit_services import upload_file

logger = logging.getLogger(__name__)

STYLE = {
    "bold_dramatic": (
        "Create a bold dramatic YouTube thumbnail using the provided headshot. "
        "Cinematic lighting, high contrast, dark mood, suspenseful atmosphere."
    ),
    "clean_minimalist": (
        "Create a clean minimalist thumbnail using the provided headshot. "
        "Soft studio lighting, simple background."
    ),
    "vibrant_energetic": (
        "Create a vibrant energetic thumbnail using the provided headshot. "
        "Bright colors, dynamic composition, bold typography."
    )
}

STYLE_ORDER = ["vibrant_energetic", "clean_minimalist", "bold_dramatic"]

async def generate_single_thumbnail(thumbnail_id: str, prompt: str, headshot_url: str):
    with Session(engine) as session:
        thumbnail_obj = session.get(Thumbnail, thumbnail_id)
        if not thumbnail_obj:
            logger.error(f"Thumbnail {thumbnail_id} not found in database")
            return
        thumbnail_obj.status = "generating"
        style_name = thumbnail_obj.style_name
        job_id = thumbnail_obj.job_id
        session.add(thumbnail_obj)
        session.commit()

    style_prompt = STYLE.get(style_name, "")
    
    try:
        # Generate the thumbnail bytes using OpenAI DALL-E 3
        image_bytes = await generate_thumbnail(prompt, style_prompt, headshot_url)
        
        # Upload the generated thumbnail to ImageKit
        imagekit_url = upload_file(
            file_bytes=image_bytes,
            file_name=f"{thumbnail_id}.png",
            folder=f"thumbnails/{job_id}"
        )
        
        # Update the thumbnail state to uploaded
        with Session(engine) as session:
            thumbnail_obj = session.get(Thumbnail, thumbnail_id)
            if thumbnail_obj:
                thumbnail_obj.imagekit_url = imagekit_url
                thumbnail_obj.status = "uploaded"
                session.add(thumbnail_obj)
                session.commit()
        
        logger.info(f"Thumbnail {thumbnail_id} generated and uploaded successfully: {imagekit_url}")

    except Exception as e:
        logger.error(f"Thumbnail {thumbnail_id} generation failed: {e}", exc_info=True)
        with Session(engine) as session:
            thumbnail_obj = session.get(Thumbnail, thumbnail_id)
            if thumbnail_obj:
                thumbnail_obj.status = "failed"
                thumbnail_obj.error_message = str(e)[:500]
                session.add(thumbnail_obj)
                session.commit()

async def process_job(job_id: str):
    with Session(engine) as session:
        job_obj = session.get(Job, job_id)
        if not job_obj:
            logger.error(f"Job {job_id} not found in database")
            return
        job_obj.status = "processing"
        prompt = job_obj.prompt
        headshot_url = job_obj.headshot_url
        session.add(job_obj)
        session.commit()

    with Session(engine) as session:
        thumbnails = session.exec(select(Thumbnail).where(Thumbnail.job_id == job_id)).all()
        thumbnails_id = [t.id for t in thumbnails]

    # Run generations in parallel
    tasks = [
        generate_single_thumbnail(tid, prompt, headshot_url) for tid in thumbnails_id
    ]
    try:
        await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        logger.error(f"Job {job_id} task gathering failed: {e}", exc_info=True)

    with Session(engine) as session:
        thumbnails = session.exec(select(Thumbnail).where(Thumbnail.job_id == job_id)).all()
        all_failed = all(t.status == "failed" for t in thumbnails)
        job_obj = session.get(Job, job_id)
        if job_obj:
            if all_failed:
                job_obj.status = "failed"
                logger.info(f"Job {job_id} marked as failed")
            else:
                job_obj.status = "completed"
                logger.info(f"Job {job_id} marked as completed")
            session.add(job_obj)
            session.commit()