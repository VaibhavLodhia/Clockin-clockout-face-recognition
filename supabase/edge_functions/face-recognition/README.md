# Face Recognition Edge Function

This Supabase Edge Function uses Python's `face_recognition` library to generate 128-dimensional face embeddings from images.

## How It Works

1. Receives base64-encoded image from mobile app
2. Decodes image to numpy array
3. Uses `face_recognition.face_encodings()` to detect face and generate embedding
4. Returns 128-dimensional embedding array

## Deployment

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Deploy the function
supabase functions deploy face-recognition
```

## Usage

**Request:**
```json
POST /functions/v1/face-recognition
Headers:
  Authorization: Bearer <user_jwt_token>
  Content-Type: application/json

Body:
{
  "image": "base64_encoded_image_string"
}
```

**Response (Success):**
```json
{
  "success": true,
  "embedding": [0.123, -0.456, ...], // 128-dimensional array
  "dimension": 128,
  "message": "Face embedding generated successfully"
}
```

**Response (No Face Detected):**
```json
{
  "error": "No face detected in image",
  "embedding": null
}
```

## Dependencies

- `face-recognition==1.3.0` - Main face recognition library (uses dlib)
- `numpy` - Numerical operations
- `Pillow` - Image processing
- `supabase` - Supabase Python client

## Notes

- The function requires a valid JWT token in the Authorization header
- Images should be in JPEG or PNG format
- Returns 128-dimensional embeddings (same as Python face_recognition library)
- Only processes the first face if multiple faces are detected

