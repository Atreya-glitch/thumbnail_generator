import logging
from contextlib import asynccontextmanager 
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import firebase_admin
from database import create_tables
from routes import router

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK for verifying ID tokens
if not firebase_admin._apps:
    firebase_admin.initialize_app(options={'projectId': 'ai-uploader-2430d'})

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield

app = FastAPI(title='Thumbnail Generator', lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:5174", "http://127.0.0.1:5174"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
