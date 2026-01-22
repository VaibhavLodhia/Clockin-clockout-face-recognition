# Troubleshooting: Network Request Failed

## Error: "Failed to call Python service: Network request failed"

This means your Expo app cannot reach the Python service. Follow these steps:

## Step 1: Check Python Service is Running

**Open a terminal and run:**
```powershell
cd python-service
python main.py
```

**You should see:**
```
INFO:     Started server process
INFO:     Uvicorn running on http://0.0.0.0:8000
```

**If you see errors:**
- Make sure you installed dependencies: `pip install -r requirements.txt`
- Check if port 8000 is already in use

## Step 2: Check Your .env File

Create or update `.env` file in the **project root** (not in python-service):

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_FACE_RECOGNITION_URL=https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition
```

## Step 3: Use Correct URL for Your Platform

### iOS Simulator
```env
EXPO_PUBLIC_FACE_RECOGNITION_URL=https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition
```

### Android Emulator
```env
EXPO_PUBLIC_FACE_RECOGNITION_URL=https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition
```

### Physical Device (Android/iOS)

1. **Find your computer's IP address:**
   ```powershell
   ipconfig
   ```
   Look for "IPv4 Address" under your WiFi adapter (only needed for local testing)

2. **Update .env:**
   ```env
EXPO_PUBLIC_FACE_RECOGNITION_URL=https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition
   ```

3. **Make sure:**
   - Phone and computer are on the **same WiFi network**
   - Windows Firewall allows port 8000
   - Python service is running

## Step 4: Restart Expo After Changing .env

After updating `.env`, **restart Expo**:
```powershell
# Stop Expo (Ctrl+C)
# Then restart:
npx expo start --clear
```

## Step 5: Test Python Service Directly

**Test if the service is working:**

1. **Open browser:** `https://vaibhavlodhiya-face-recognition-api.hf.space`
   - Should show: `{"service":"Face Recognition Service","status":"running","version":"1.0.0"}`

2. **Or use curl:**
   ```powershell
   curl https://vaibhavlodhiya-face-recognition-api.hf.space
   ```

## Step 6: Check Windows Firewall

**If using physical device, allow port 8000:**

1. Open Windows Defender Firewall
2. Advanced Settings
3. Inbound Rules → New Rule
4. Port → TCP → 8000
5. Allow connection
6. Apply to all profiles

## Quick Checklist

- [ ] Python service running (`python main.py` shows "Uvicorn running")
- [ ] `.env` file exists in project root
- [ ] Correct URL for your platform (localhost/10.0.2.2/your-ip)
- [ ] Expo restarted after changing `.env`
- [ ] Phone and computer on same WiFi (if physical device)
- [ ] Firewall allows port 8000 (if physical device)

## Still Not Working?

1. **Check Python service logs** - look for errors when you try to use face recognition
2. **Check Expo logs** - look for the URL being used
3. **Try accessing service in browser** - `https://vaibhavlodhiya-face-recognition-api.hf.space` should work
4. **Test with curl:**
   ```powershell
   curl -X POST https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition -H "Authorization: Bearer test-token" -H "Content-Type: application/json" -d "{\"image\":\"test\"}"
   ```

## Common Issues

### "Connection refused"
- Python service is not running
- Wrong port number

### "Network request failed" (iOS Simulator)
- Use `localhost` not `127.0.0.1`
- Make sure Python service is running

### "Network request failed" (Android Emulator)
- Use `10.0.2.2` not `localhost`
- Make sure Python service is running

### "Network request failed" (Physical Device)
- Use your computer's IP address
- Check firewall settings
- Ensure same WiFi network




