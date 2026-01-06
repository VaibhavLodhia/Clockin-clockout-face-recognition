# Supabase Edge Function: Face Recognition
# Uses Python face_recognition library to generate 128-dimensional embeddings
# Reference: https://github.com/computervisioneng/face-attendance-system

import os
import json
import base64
import io
from typing import Dict, Any, Optional
from supabase import create_client, Client
import face_recognition
import numpy as np
from PIL import Image

# CORS headers
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
}

def handle_cors():
    """Handle CORS preflight requests"""
    return {
        "statusCode": 200,
        "headers": CORS_HEADERS,
        "body": json.dumps({"message": "ok"})
    }

def decode_base64_image(base64_string: str) -> np.ndarray:
    """Decode base64 image string to numpy array for face_recognition"""
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        # Decode base64
        image_data = base64.b64decode(base64_string)
        
        # Convert to PIL Image
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Convert to numpy array (face_recognition expects RGB format)
        image_array = np.array(image)
        
        return image_array
    except Exception as e:
        raise ValueError(f"Failed to decode image: {str(e)}")

def generate_face_embedding(image_array: np.ndarray) -> Optional[list]:
    """
    Generate 128-dimensional face embedding using face_recognition library
    This is the same as: face_recognition.face_encodings(img)[0]
    """
    try:
        # Generate face encodings (128-dimensional vectors)
        # This detects facial features: eyes, nose, mouth, face shape, etc.
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

def main(event: Dict[str, Any]) -> Dict[str, Any]:
    """Main handler for the Edge Function"""
    
    # Handle CORS preflight
    if event.get("httpMethod") == "OPTIONS":
        return handle_cors()
    
    try:
        # Get Supabase client
        supabase_url = os.environ.get("SUPABASE_URL", "")
        supabase_key = os.environ.get("SUPABASE_ANON_KEY", "")
        
        if not supabase_url or not supabase_key:
            return {
                "statusCode": 500,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": "Supabase configuration missing"})
            }
        
        supabase: Client = create_client(supabase_url, supabase_key)
        
        # Get authorization header
        headers = event.get("headers", {})
        auth_header = headers.get("authorization") or headers.get("Authorization", "")
        
        if not auth_header:
            return {
                "statusCode": 401,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": "Unauthorized: No authorization header"})
            }
        
        # Verify user authentication
        # Note: In Supabase Edge Functions, you typically verify the JWT token
        # For simplicity, we'll trust the auth header is valid (Supabase handles this)
        
        # Parse request body
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)
        
        image_base64 = body.get("image")
        if not image_base64:
            return {
                "statusCode": 400,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing 'image' field in request body"})
            }
        
        # Decode base64 image
        try:
            image_array = decode_base64_image(image_base64)
        except ValueError as e:
            return {
                "statusCode": 400,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": str(e)})
            }
        
        # Generate face embedding
        try:
            embedding = generate_face_embedding(image_array)
        except ValueError as e:
            return {
                "statusCode": 400,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({"error": str(e)})
            }
        
        if embedding is None:
            return {
                "statusCode": 400,
                "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
                "body": json.dumps({
                    "error": "No face detected in image",
                    "embedding": None
                })
            }
        
        # Return embedding (128-dimensional array)
        return {
            "statusCode": 200,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({
                "success": True,
                "embedding": embedding,
                "dimension": len(embedding),
                "message": "Face embedding generated successfully"
            })
        }
        
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {**CORS_HEADERS, "Content-Type": "application/json"},
            "body": json.dumps({"error": f"Internal server error: {str(e)}"})
        }

