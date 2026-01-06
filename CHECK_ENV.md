# Check Your .env File

Since you already have a `.env` file, please verify it has this format:

## Required Format

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url_here
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
EXPO_PUBLIC_FACE_RECOGNITION_URL=http://localhost:8000/api/face-recognition
```

## Important Notes

1. **No spaces around `=`** - Correct: `KEY=value`, Wrong: `KEY = value`
2. **No quotes needed** - Correct: `URL=http://localhost:8000`, Wrong: `URL="http://localhost:8000"`
3. **Must start with `EXPO_PUBLIC_`** - This is required for Expo to load the variable
4. **For iOS Simulator:** Use `http://localhost:8000/api/face-recognition`
5. **For Android Emulator:** Use `http://10.0.2.2:8000/api/face-recognition`

## After Updating .env

1. **Stop Expo** (Ctrl+C)
2. **Clear cache and restart:**
   ```powershell
   npx expo start --clear
   ```

## Verify It's Loaded

When the app starts, check the Expo logs. You should see:
```
🔧 Face Recognition Service URL: http://localhost:8000/api/face-recognition
🔧 Environment variable: http://localhost:8000/api/face-recognition
```

If you see `NOT SET (using default)`, the `.env` file is not being loaded.

## Common Issues

- **File location:** Must be in project root (same folder as `package.json`)
- **File name:** Must be exactly `.env` (not `.env.txt` or `.env.local`)
- **Restart required:** Always restart Expo after changing `.env`
- **Cache:** Use `--clear` flag to clear cache




