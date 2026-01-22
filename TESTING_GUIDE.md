# Testing Face Recognition with Expo App

## Step 1: Start Python Service

### Option A: Local Development

1. **Open a terminal and navigate to python-service:**
   ```powershell
   cd python-service
   ```

2. **Start the service:**
   ```powershell
   python main.py
   ```

   You should see:
   ```
   INFO:     Started server process
   INFO:     Waiting for application startup.
   INFO:     Application startup complete.
   INFO:     Uvicorn running on http://0.0.0.0:8000
   ```

3. **Keep this terminal open** - the service must be running!

### Option B: Test the Service First (Optional)

In another terminal:
```powershell
cd python-service
python test_service.py
```

(You'll need a test image file named `test_face.jpg` in the python-service directory)

## Step 2: Configure Expo App

1. **Create `.env` file** in the project root (if it doesn't exist):
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
  EXPO_PUBLIC_FACE_RECOGNITION_URL=https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition
   ```

2. **For Android Emulator/Physical Device:**
   - Use: `https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition`

3. **For iOS Simulator:**
   - Use: `https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition`

## Step 3: Start Expo App

1. **In the project root, start Expo:**
   ```powershell
   npx expo start --clear
   ```

2. **Open on your device:**
   - Scan QR code with Expo Go app (Android/iOS)
   - Or press `a` for Android, `i` for iOS

## Step 4: Test Face Recognition

1. **Sign Up / Login** to the app
2. **Enroll Face:**
   - Go to signup or profile
   - Take 3-5 photos of your face
   - The app will send images to Python service
   - Check Python service terminal for logs

3. **Clock In/Out:**
   - Try clocking in/out
   - Face verification should work
   - Check Python service terminal for API calls

## Troubleshooting

### "Failed to call Python service"

**Check:**
- Is Python service running? (Check terminal)
- Is the URL correct in `.env`?
- For Android emulator, use `10.0.2.2` instead of `localhost`
- For physical device, use your computer's IP address

### "Connection refused"

**Solutions:**
- Make sure Python service is running on port 8000
- Check firewall isn't blocking port 8000
- For physical device, ensure phone and computer are on same WiFi network

### "No face detected"

**Solutions:**
- Make sure face is clearly visible
- Good lighting
- Face should fill most of the camera frame
- Check Python service logs for details

### Check Python Service Logs

The Python service terminal will show:
- `✅ Face embedding generated successfully` - Success!
- `No face detected in image` - Face not found
- `Image decoding failed` - Image format issue

## For Production Deployment

1. **Deploy Python service to Railway/Render:**
   ```bash
   cd python-service
   railway up  # or deploy to Render
   ```

2. **Update `.env` with deployed URL:**
   ```env
   EXPO_PUBLIC_FACE_RECOGNITION_URL=https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition
   ```

3. **Restart Expo:**
   ```bash
   npx expo start --clear
   ```

## Testing Checklist

- [ ] Python service running on port 8000
- [ ] `.env` file configured with correct URL
- [ ] Expo app started
- [ ] Can sign up/login
- [ ] Face enrollment works (3-5 photos)
- [ ] Clock in/out with face recognition works
- [ ] Python service logs show successful API calls




