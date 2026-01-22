# Quick test script for the face recognition service
# Usage: python test_service.py

import requests
import base64
import json
from pathlib import Path

# Test image path (you can use any image with a face)
TEST_IMAGE_PATH = "test_face.jpg"  # Change this to your test image

def test_face_recognition_service():
    """Test the face recognition service"""
    
    # Check if test image exists
    if not Path(TEST_IMAGE_PATH).exists():
        print(f"❌ Test image not found: {TEST_IMAGE_PATH}")
        print("Please provide a test image with a face.")
        return
    
    # Read and encode image
    with open(TEST_IMAGE_PATH, 'rb') as f:
        image_data = f.read()
        image_base64 = base64.b64encode(image_data).decode('utf-8')
    
    # Service URL
    service_url = "https://vaibhavlodhiya-face-recognition-api.hf.space/api/face-recognition"
    
    # Headers
    headers = {
        "Authorization": "Bearer test-token",
        "Content-Type": "application/json"
    }
    
    # Request body
    payload = {
        "image": image_base64
    }
    
    print("Testing face recognition service...")
    print(f"Service URL: {service_url}")
    print(f"Image: {TEST_IMAGE_PATH}")
    print()
    
    try:
        # Make request
        response = requests.post(service_url, json=payload, headers=headers)
        
        # Check response
        if response.status_code == 200:
            result = response.json()
            
            if result['success']:
                print("✅ SUCCESS!")
                print(f"Message: {result['message']}")
                print(f"Embedding dimension: {result['dimension']}")
                print(f"Embedding (first 10 values): {result['embedding'][:10]}")
                print(f"Embedding length: {len(result['embedding'])}")
            else:
                print("❌ FAILED")
                print(f"Message: {result['message']}")
                if result.get('error'):
                    print(f"Error: {result['error']}")
        else:
            print(f"❌ HTTP Error: {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Is the service running?")
        print("Start the service with: python main.py")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_face_recognition_service()




