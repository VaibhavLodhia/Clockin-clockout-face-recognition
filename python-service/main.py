# Face Recognition Service - FastAPI
# Deploy this on Railway, Render, or similar
# Uses Python face_recognition library (same as reference repo)

import base64
import io
import os
from typing import Optional

import face_recognition
import numpy as np
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel

app = FastAPI(title="Face Recognition Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your app's origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request/Response models
class FaceRecognitionRequest(BaseModel):
    image: str  # Base64 encoded image


class FaceRecognitionResponse(BaseModel):
    success: bool
    embedding: Optional[list] = None
    dimension: Optional[int] = None
    faces_detected: Optional[int] = None
    message: str
    error: Optional[str] = None
    face_box: Optional[dict] = None
    detection_method: Optional[str] = None


class FaceDetectionRequest(BaseModel):
    image: str  # Base64 encoded image


class FaceDetectionResponse(BaseModel):
    success: bool
    face_detected: bool
    face_box: Optional[dict] = None
    detection_method: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


def verify_token(authorization: Optional[str] = Header(None)) -> bool:
    """Verify JWT token (simplified - in production, verify with Supabase)"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    # In production, verify the JWT token with Supabase
    # For now, just check that it exists
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")

    return True


def decode_base64_image(base64_string: str, max_size: int = 3000) -> np.ndarray:
    """Decode base64 image string to numpy array for face_recognition
    Resizes large images to max_size for faster processing
    """
    try:
        # Remove data URL prefix if present
        if "," in base64_string:
            base64_string = base64_string.split(",")[1]

        # Decode base64
        image_data = base64.b64decode(base64_string)
        print(f"📦 Decoded base64: {len(image_data)} bytes")

        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_data))
        print(
            f"📐 Original image: {image.size[0]}x{image.size[1]}, format: {image.format}, mode: {image.mode}"
        )

        # Convert to RGB if necessary
        if image.mode != "RGB":
            print(f"🔄 Converting from {image.mode} to RGB")
            image = image.convert("RGB")

        # Handle EXIF orientation (images from phones may be rotated)
        # This is CRITICAL - phone photos often have EXIF orientation tags
        try:
            # Check for EXIF orientation tag
            exif = image._getexif()
            if exif is not None:
                # EXIF orientation tag is 274 (or 0x0112)
                orientation = exif.get(274) or exif.get(0x0112)
                if orientation:
                    print(f"📐 EXIF orientation detected: {orientation}")
                    if orientation == 3:
                        image = image.rotate(180, expand=True)
                        print("🔄 Rotated 180 degrees")
                    elif orientation == 6:
                        image = image.rotate(270, expand=True)
                        print("🔄 Rotated 270 degrees (90° clockwise)")
                    elif orientation == 8:
                        image = image.rotate(90, expand=True)
                        print("🔄 Rotated 90 degrees (90° counter-clockwise)")
                    # Orientation 1 = normal (no rotation needed)
        except (AttributeError, KeyError, TypeError, Exception) as e:
            # No EXIF data or can't read it, continue
            print(f"ℹ️ No EXIF orientation data (or error reading): {e}")

        # CRITICAL: Don't resize too aggressively - production builds need larger images for face detection
        # Only resize if image is REALLY large (over 3000px) to preserve face detail
        width, height = image.size
        print(f"📐 Image dimensions before resize: {width}x{height}")
        if width > 3000 or height > 3000:
            # Calculate new size maintaining aspect ratio, but keep it large
            ratio = min(3000 / width, 3000 / height)
            new_width = int(width * ratio)
            new_height = int(height * ratio)
            image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            print(
                f"📐 Resized image from {width}x{height} to {new_width}x{new_height} (kept large for face detection)"
            )
        else:
            print(
                f"📐 Image size OK, not resizing (keeping {width}x{height} for better face detection)"
            )

        # Convert to numpy array (face_recognition expects RGB format, uint8 dtype)
        image_array = np.array(image, dtype=np.uint8)

        # Verify the array is correct format
        if len(image_array.shape) != 3 or image_array.shape[2] != 3:
            raise ValueError(
                f"Invalid image shape: {image_array.shape}, expected (height, width, 3)"
            )

        if image_array.dtype != np.uint8:
            raise ValueError(
                f"Invalid image dtype: {image_array.dtype}, expected uint8"
            )

        return image_array
    except Exception as e:
        raise ValueError(f"Failed to decode image: {str(e)}")


def detect_face_location(
    image_array: np.ndarray, model: str = "hog"
) -> Optional[tuple]:
    """
    Detect face location using face_recognition library
    Returns: (top, right, bottom, left) or None if no face detected
    """
    try:
        # Validate image array
        print(f"🔍 Image array shape: {image_array.shape}, dtype: {image_array.dtype}")
        print(f"🔍 Image value range: min={image_array.min()}, max={image_array.max()}")

        # Ensure image is uint8 (0-255 range)
        if image_array.dtype != np.uint8:
            print(f"⚠️ Converting image from {image_array.dtype} to uint8")
            if image_array.max() <= 1.0:
                # Image is normalized (0-1), scale to 0-255
                image_array = (image_array * 255).astype(np.uint8)
            else:
                image_array = image_array.astype(np.uint8)

        # Try detection with different upsampling values
        # Start with no upsampling (faster, works for larger faces)
        print("🔍 Trying face detection with number_of_times_to_upsample=0...")
        face_locations = face_recognition.face_locations(
            image_array, model=model, number_of_times_to_upsample=0
        )

        if len(face_locations) == 0:
            # Try with upsampling=1 (upsamples 1x)
            print("🔍 No face found, trying with number_of_times_to_upsample=1...")
            face_locations = face_recognition.face_locations(
                image_array, model=model, number_of_times_to_upsample=1
            )

        if len(face_locations) == 0:
            # Try with upsampling=2 (upsamples 2x - slower but detects smaller faces)
            print("🔍 No face found, trying with number_of_times_to_upsample=2...")
            face_locations = face_recognition.face_locations(
                image_array, model=model, number_of_times_to_upsample=2
            )

        if len(face_locations) == 0:
            # Try with CNN model (more accurate but slower) - CRITICAL for production builds
            print("🔍 No face found with HOG, trying CNN model (more accurate)...")
            face_locations = face_recognition.face_locations(
                image_array, model="cnn", number_of_times_to_upsample=1
            )

        if len(face_locations) == 0:
            # Try CNN with upsampling=2 (most thorough but slowest)
            print("🔍 No face found with CNN upsampling=1, trying CNN upsampling=2...")
            face_locations = face_recognition.face_locations(
                image_array, model="cnn", number_of_times_to_upsample=2
            )

        if len(face_locations) == 0:
            # Last resort: Try HOG with upsampling=3 (very thorough)
            print("🔍 No face found, trying HOG with upsampling=3 (last resort)...")
            face_locations = face_recognition.face_locations(
                image_array, model="hog", number_of_times_to_upsample=3
            )

        if len(face_locations) == 0:
            print("❌ No face detected with ANY method (HOG/CNN, upsampling 0/1/2/3)")
            print(f"   Image dimensions: {image_array.shape[1]}x{image_array.shape[0]}")
            print(f"   Image value range: {image_array.min()}-{image_array.max()}")
            print(f"   Image dtype: {image_array.dtype}")
            print(f"   Image shape: {image_array.shape}")
            return None

        print(f"✅ Face detected! Found {len(face_locations)} face(s)")
        # Return first face location: (top, right, bottom, left)
        return face_locations[0]
    except Exception as e:
        print(f"❌ Exception in face detection: {str(e)}")
        import traceback

        traceback.print_exc()
        raise ValueError(f"Failed to detect face: {str(e)}")


def generate_face_embedding(
    image_array: np.ndarray, face_location: Optional[tuple] = None
) -> Optional[list]:
    """
    Generate 128-dimensional face embedding using face_recognition library
    This is the same as: face_recognition.face_encodings(img)[0]
    Detects actual facial features: eyes, nose, mouth, face shape, etc.
    """
    try:
        # Generate face encodings (128-dimensional vectors)
        # If face_location is provided, use it for faster processing
        if face_location:
            encodings = face_recognition.face_encodings(
                image_array, known_face_locations=[face_location]
            )
        else:
            encodings = face_recognition.face_encodings(image_array)

        if len(encodings) == 0:
            # No face detected
            return None

        # Return first face encoding (128-dimensional array)
        # Convert numpy array to list for JSON serialization
        embedding = encodings[0].tolist()

        return embedding
    except Exception as e:
        raise ValueError(f"Failed to generate face embedding: {str(e)}")


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "service": "Face Recognition Service",
        "status": "running",
        "version": "1.0.0",
    }


@app.post("/api/face-detection", response_model=FaceDetectionResponse)
async def face_detection_endpoint(
    request: FaceDetectionRequest, token_verified: bool = Depends(verify_token)
):
    """
    Detect face in image and return bounding box

    Args:
        request: Contains base64 encoded image

    Returns:
        FaceDetectionResponse with face_detected and face_box
    """
    print(
        "🔍 Face detection request received, image size:", len(request.image), "bytes"
    )
    try:
        # Decode base64 image - use larger max_size (2000px) for better face detection in production builds
        print("📸 Decoding image...")
        try:
            image_array = decode_base64_image(request.image, max_size=3000)
            print("✅ Image decoded, shape:", image_array.shape)
        except ValueError as e:
            print("❌ Image decoding failed:", str(e))
            return FaceDetectionResponse(
                success=False,
                face_detected=False,
                message="Image decoding failed",
                error=str(e),
            )

        # Use HOG model only (faster, CNN is too slow for real-time)
        print("🔍 Detecting face (HOG)...")
        face_location = detect_face_location(image_array, model="hog")
        detection_method = "hog"

        # If no face detected, try with original larger image (if it was resized)
        if face_location is None and (
            image_array.shape[0] < 500 or image_array.shape[1] < 500
        ):
            print("⚠️ No face detected with resized image, trying with larger size...")
            # Re-decode without resizing to try with original size
            try:
                if "," in request.image:
                    base64_string = request.image.split(",")[1]
                else:
                    base64_string = request.image
                image_data = base64.b64decode(base64_string)
                image = Image.open(io.BytesIO(image_data))
                if image.mode != "RGB":
                    image = image.convert("RGB")
                # Only resize if really huge (over 2000px)
                width, height = image.size
                if width > 2000 or height > 2000:
                    ratio = min(2000 / width, 2000 / height)
                    new_width = int(width * ratio)
                    new_height = int(height * ratio)
                    image = image.resize(
                        (new_width, new_height), Image.Resampling.LANCZOS
                    )
                image_array_large = np.array(image)
                print(f"🔍 Retrying with larger image: {image_array_large.shape}")
                face_location = detect_face_location(image_array_large, model="hog")
                if face_location:
                    image_array = image_array_large  # Use the larger image
                    print("✅ Face detected with larger image")
            except Exception as e:
                print(f"⚠️ Failed to retry with larger image: {e}")

        if face_location is None:
            print("❌ No face detected")
            return FaceDetectionResponse(
                success=True, face_detected=False, message="No face detected in image"
            )

        print("✅ Face detected using", detection_method)

        # Convert face_location (top, right, bottom, left) to (x, y, w, h)
        top, right, bottom, left = face_location
        height, width = image_array.shape[:2]

        face_box = {
            "x": int(left),
            "y": int(top),
            "w": int(right - left),
            "h": int(bottom - top),
        }

        return FaceDetectionResponse(
            success=True,
            face_detected=True,
            face_box=face_box,
            detection_method=detection_method,
            message="Face detected successfully",
        )

    except Exception as e:
        return FaceDetectionResponse(
            success=False,
            face_detected=False,
            message="Internal server error",
            error=str(e),
        )


@app.post("/api/face-recognition", response_model=FaceRecognitionResponse)
async def face_recognition_endpoint(
    request: FaceRecognitionRequest,
    http_request: Request,
    token_verified: bool = Depends(verify_token),
):
    """
    Generate face embedding from image

    Args:
        request: Contains base64 encoded image

    Returns:
        FaceRecognitionResponse with 128-dimensional embedding and face_box
    """
    client_host = http_request.client.host if http_request.client else "unknown"
    origin = http_request.headers.get("origin", "unknown")
    print(
        "🎯 Face recognition request received",
        "| image size:",
        len(request.image),
        "bytes",
        "| client:",
        client_host,
        "| origin:",
        origin,
    )
    try:
        # Decode base64 image - use larger max_size (3000px) for better face detection in production builds
        print("📸 Decoding image...")
        try:
            image_array = decode_base64_image(request.image, max_size=3000)
            print("✅ Image decoded, shape:", image_array.shape)
        except ValueError as e:
            return FaceRecognitionResponse(
                success=False, message="Image decoding failed", error=str(e)
            )

        # Detect face location first (for bounding box)
        # Use HOG only - CNN is too slow and causes timeouts
        print("🔍 Detecting face location (HOG)...")
        face_location = detect_face_location(image_array, model="hog")
        detection_method = "hog"

        # If no face detected, try with original larger image (if it was resized)
        if face_location is None and (
            image_array.shape[0] < 500 or image_array.shape[1] < 500
        ):
            print("⚠️ No face detected with resized image, trying with larger size...")
            # Re-decode without resizing to try with original size
            try:
                if "," in request.image:
                    base64_string = request.image.split(",")[1]
                else:
                    base64_string = request.image
                image_data = base64.b64decode(base64_string)
                image = Image.open(io.BytesIO(image_data))
                if image.mode != "RGB":
                    image = image.convert("RGB")
                # Only resize if really huge (over 2000px)
                width, height = image.size
                if width > 2000 or height > 2000:
                    ratio = min(2000 / width, 2000 / height)
                    new_width = int(width * ratio)
                    new_height = int(height * ratio)
                    image = image.resize(
                        (new_width, new_height), Image.Resampling.LANCZOS
                    )
                image_array_large = np.array(image)
                print(f"🔍 Retrying with larger image: {image_array_large.shape}")
                face_location = detect_face_location(image_array_large, model="hog")
                if face_location:
                    image_array = image_array_large  # Use the larger image
                    print("✅ Face detected with larger image")
            except Exception as e:
                print(f"⚠️ Failed to retry with larger image: {e}")

        if face_location is None:
            print("❌ No face detected")
            return FaceRecognitionResponse(
                success=False,
                message="No face detected in image",
                error="NO_FACE_DETECTED",
                faces_detected=0,
            )

        print("✅ Face detected, generating embedding...")
        # Generate face embedding using the detected location
        try:
            embedding = generate_face_embedding(image_array, face_location)
            print(
                "✅ Embedding generated, dimension:", len(embedding) if embedding else 0
            )
        except ValueError as e:
            return FaceRecognitionResponse(
                success=False, message="Face embedding generation failed", error=str(e)
            )

        if embedding is None:
            return FaceRecognitionResponse(
                success=False,
                message="No face detected in image",
                error="NO_FACE_DETECTED",
                faces_detected=0,
            )

        # Convert face_location to face_box format
        top, right, bottom, left = face_location
        face_box = {
            "x": int(left),
            "y": int(top),
            "w": int(right - left),
            "h": int(bottom - top),
        }

        # Return embedding (128-dimensional array) with face_box
        print("✅ Returning response")
        return FaceRecognitionResponse(
            success=True,
            embedding=embedding,
            dimension=len(embedding),
            faces_detected=1,
            face_box=face_box,
            detection_method=detection_method,
            message="Face embedding generated successfully",
        )

    except Exception as e:
        print(f"❌ Error in face recognition: {str(e)}")
        import traceback

        traceback.print_exc()
        return FaceRecognitionResponse(
            success=False, message="Internal server error", error=str(e)
        )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
