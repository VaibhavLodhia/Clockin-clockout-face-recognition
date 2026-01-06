# Verify Your .env File

## Your .env File Should Look Like This:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
EXPO_PUBLIC_FACE_RECOGNITION_URL=http://127.0.0.1:8000/api/face-recognition
```

## Important Rules:

1. **No spaces around `=`**
   - ✅ Correct: `KEY=value`
   - ❌ Wrong: `KEY = value`

2. **No quotes**
   - ✅ Correct: `URL=http://127.0.0.1:8000/api/face-recognition`
   - ❌ Wrong: `URL="http://127.0.0.1:8000/api/face-recognition"`

3. **Must start with `EXPO_PUBLIC_`**
   - ✅ Correct: `EXPO_PUBLIC_FACE_RECOGNITION_URL=...`
   - ❌ Wrong: `FACE_RECOGNITION_URL=...`

4. **File location**
   - Must be in project root (same folder as `package.json`)
   - File name must be exactly `.env` (not `.env.txt` or `.env.local`)

## For iOS Simulator:
```env
EXPO_PUBLIC_FACE_RECOGNITION_URL=http://127.0.0.1:8000/api/face-recognition
```

## For Physical iOS Device:
```env
EXPO_PUBLIC_FACE_RECOGNITION_URL=http://10.0.0.34:8000/api/face-recognition
```
(Use your computer's IP address - we found yours is `10.0.0.34`)

## After Updating .env:

1. **Stop Expo** (Ctrl+C)
2. **Clear cache and restart:**
   ```powershell
   npx expo start --clear
   ```

## Verify It's Loaded:

When app starts, check Expo logs. You should see:
```
🔧 Face Recognition Service URL: http://127.0.0.1:8000/api/face-recognition
🔧 Environment variable: http://127.0.0.1:8000/api/face-recognition
🔧 Platform: ios
```

If you see `NOT SET (using default)`, the `.env` file is not being loaded.

## Common Issues:

- **File not found**: Make sure `.env` is in project root
- **Not loading**: Restart Expo with `--clear` flag
- **Wrong format**: Check for spaces, quotes, or missing `EXPO_PUBLIC_` prefix
- **Cache**: Always use `--clear` when changing `.env`




