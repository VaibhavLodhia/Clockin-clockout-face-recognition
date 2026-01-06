# Quick test - no image file needed
# Tests if the service is responding correctly

import requests
import base64

# Create a simple test image (1x1 pixel PNG) encoded in base64
# This is just to test the API, not for actual face recognition
test_image_base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def test_service():
    """Quick test of the face recognition service"""
    
    service_url = "http://localhost:8000/api/face-recognition"
    
    headers = {
        "Authorization": "Bearer test-token",
        "Content-Type": "application/json"
    }
    
    payload = {
        "image": test_image_base64
    }
    
    print("Testing Python service...")
    print(f"URL: {service_url}")
    print()
    
    try:
        response = requests.post(service_url, json=payload, headers=headers, timeout=5)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.json()}")
        print()
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("✅ Service is working! (but no face detected - expected with test image)")
            else:
                print(f"⚠️ Service responded: {result.get('message')}")
        else:
            print(f"❌ Error: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Service is not running!")
        print("   Start it with: python main.py")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_service()




