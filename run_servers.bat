@echo off
echo ===================================================
echo Starting Thumbnail Uploader Servers...
echo ===================================================

echo [1/2] Launching Backend (FastAPI on port 8000)...
start "Backend Server" cmd /k "cd backend && venv\Scripts\python -m uvicorn main:app --reload --port 8000"

echo [2/2] Launching Frontend (Vite Dev Server on port 5173)...
start "Frontend Server" cmd /k "cd my-app && npm run dev"

echo ===================================================
echo Both servers are starting up!
echo - Frontend: http://localhost:5173/
echo - Backend API: http://localhost:8000/
echo ===================================================
pause
