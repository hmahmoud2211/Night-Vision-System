# Python Backend (FastAPI)

Simple image enhancement service for the Night Vision app.

## Run locally

```powershell
cd backend/python
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Set the frontend env so it talks to this backend:

```powershell
set EXPO_PUBLIC_RORK_API_BASE_URL=http://localhost:8000
```

## API

- `GET /health` → `{ "status": "ok" }`
- `GET /status` → `{ "status": "ok", "version": "0.3.0", "background_frames": number }`
- `POST /enhance` (multipart/form-data, field `file`):
  - Automatically computes mean luminance; if below threshold (default 60), applies log-based enhancement with gain (default 2.0).
  - Optional params: `mode`, `intensity`, `max_side`, `include_stats`
  - Response: `{ applied: boolean, luminance: number, image_base64: string, processing_ms: number }`
- `POST /analyze` (multipart/form-data, field `file`):
  - Returns luminance, noise, contrast, sharpness, dynamic range, and recommended mode.
- `POST /motion` (multipart/form-data, fields `current`, `previous`):
  - Frame differencing with adaptive background modeling and connected components.
  - Optional `max_side` for faster processing.
  - Response: `{ motion: boolean, confidence: number, objects_count: number, processing_ms: number }`
- `POST /calibrate`:
  - Resets the adaptive background model.
- `POST /motion` (multipart/form-data, fields `current`, `previous`):
  - Frame differencing: flags motion when fraction of pixels above `diff_threshold` exceeds `motion_ratio` (defaults: 25.0, 0.02).
  - Response: `{ motion: boolean, diff_ratio: number, diff_threshold: number, motion_ratio: number }`

Example curl:

```bash
curl -X POST http://localhost:8000/enhance \
  -F "file=@sample.jpg" \
  -F "luminance_threshold=60" \
  -F "log_gain=2.0" \
  -F "include_stats=true"

curl -X POST http://localhost:8000/analyze \
  -F "file=@sample.jpg"

curl -X POST http://localhost:8000/motion \
  -F "current=@frame1.jpg" \
  -F "previous=@frame0.jpg" \
  -F "diff_threshold=25" \
  -F "motion_ratio=0.02"

curl -X POST http://localhost:8000/calibrate
```
