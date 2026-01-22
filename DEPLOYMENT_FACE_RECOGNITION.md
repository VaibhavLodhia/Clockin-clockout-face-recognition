# Face Recognition Service Deployment Guide

## Overview

The face recognition system uses a Python backend service that runs the `face_recognition` library (same as the reference repository). This service generates real 128-dimensional embeddings from facial features.

## Architecture

```
Mobile App (React Native)
    ↓ (sends base64 image)
Python Service (FastAPI)
    ↓ (uses face_recognition.face_encodings())
Returns 128-dimensional embedding
    ↓
Mobile App (compares embeddings)
```

## Step 1: Deploy Python Service

### Option A: Railway (Recommended - Free tier)

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway:**
   ```bash
   railway login
   ```

3. **Navigate to python-service directory:**
   ```bash
   cd python-service
   ```

4. **Initialize Railway project:**
   ```bash
   railway init
   ```

5. **Deploy:**
   ```bash
   railway up
   ```

6. **Get the service URL:**
   - Your base URL: `https://vaibhavlodhiya-face-recognition-api.hf.space`
   - Your API endpoint: `https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition`

### Option B: Render

1. Go to [render.com
2. Create a new "Web Service"
3. Connect your GitHub repository
4. Set:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python main.py`
   - **Environment:** Python 3
5. Deploy

### Option C: Hugging Face Spaces (Docker)

1. **Create accounts (required):**
   - **Hugging Face** (for Spaces)
   - **GitHub** (optional but easiest to connect repo)
2. **Ensure Dockerfile exists** in `python-service/` (provided in repo).
3. **Create a new Space:**
   - Go to https://huggingface.co/spaces
   - New Space → **Docker** as SDK
4. **Connect the repo** (or upload the `python-service/` folder).
5. **Set the app port**:
   - Hugging Face expects port **7860** (already set in Dockerfile).
6. **Build & deploy** and wait for Space to go live.
7. **Get the service URL:**
   - Your base URL will look like: `https://your-space.hf.space`
   - Your API endpoint will be: `https://your-space.hf.space/api/face-recognition`

### Option D: Local Development (for testing)

```bash
cd python-service
pip install -r requirements.txt
python main.py
```

Service runs on `https://vaibhavlodhiya-face-recognition-api.hf.space`

## Step 2: Update React Native App

1. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. **Update `.env` with your service URL:**
   ```env
   EXPO_PUBLIC_FACE_RECOGNITION_URL=https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition
   ```

3. **Restart Expo:**
   ```bash
   npx expo start --clear
   ```

## Step 3: Test the Integration

1. **Test face enrollment:**
   - Sign up a new user
   - Capture face images
   - Verify embeddings are generated (check console logs)

2. **Test face verification:**
   - Clock in/out
   - Verify face recognition works

## How It Works

1. **Mobile app captures image** → Converts to base64
2. **Sends to Python service** → POST request with image
3. **Python service:**
   - Decodes base64 image
   - Uses `face_recognition.face_encodings()` (same as reference repo)
   - Returns 128-dimensional embedding
4. **Mobile app:**
   - Receives embedding
   - Stores it (enrollment) or compares it (verification)
   - Uses cosine similarity for matching

## Troubleshooting

### Service not responding
- Check service is deployed and running
- Verify the URL in `.env` is correct
- Check service logs (Railway/Render dashboard)

### "No face detected" errors
- Ensure good lighting
- Face should be clearly visible
- Check image quality

### Authentication errors
- Verify JWT token is being sent
- Check service accepts the token format

## Security Notes

- In production, verify JWT tokens properly in the Python service
- Consider rate limiting
- Use HTTPS only
- Validate image size/format

## Cost Estimates

- **Railway:**** Free tier available (500 hours/month)
- **Render:** Free tier available (750 hours/month)
- **Heroku:** Paid plans only

For 30 employees, free tiers should be sufficient.

