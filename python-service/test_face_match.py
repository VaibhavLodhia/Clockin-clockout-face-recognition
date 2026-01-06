# Face Recognition Test Script
# Loads reference image, generates embedding, then tests another image

import sys
import os
import face_recognition
import numpy as np
from PIL import Image, ImageDraw
import cv2

# Reference image path
REFERENCE_IMAGE_PATH = r"C:\Users\Dell\Desktop\Vaibhav_Photo.jpg"
REFERENCE_NAME = "Vaibhav"

def load_reference_embedding():
    """Load reference image and generate embedding"""
    try:
        print(f"📸 Loading reference image: {REFERENCE_IMAGE_PATH}")
        
        # Check if file exists
        if not os.path.exists(REFERENCE_IMAGE_PATH):
            print(f"❌ Reference image not found: {REFERENCE_IMAGE_PATH}")
            return None
        
        # Load image using face_recognition (it handles image loading)
        reference_image = face_recognition.load_image_file(REFERENCE_IMAGE_PATH)
        
        # Generate face encodings (128-dimensional embeddings)
        print("🔍 Detecting face in reference image...")
        reference_encodings = face_recognition.face_encodings(reference_image)
        
        if len(reference_encodings) == 0:
            print("❌ No face detected in reference image!")
            return None
        
        print(f"✅ Reference embedding generated: {len(reference_encodings[0])} dimensions")
        return reference_encodings[0]
        
    except Exception as e:
        print(f"❌ Error loading reference image: {e}")
        import traceback
        traceback.print_exc()
        return None


def test_image(image_path, reference_embedding):
    """Test an image against reference embedding"""
    try:
        print(f"\n📸 Testing image: {image_path}")
        
        # Check if file exists
        if not os.path.exists(image_path):
            print(f"❌ Image not found: {image_path}")
            return False, None
        
        # Load image
        test_image = face_recognition.load_image_file(image_path)
        
        # Detect face locations
        print("🔍 Detecting face...")
        face_locations = face_recognition.face_locations(
            test_image, 
            model="hog",
            number_of_times_to_upsample=1
        )
        
        if len(face_locations) == 0:
            print("❌ No face detected in test image!")
            return False, None
        
        print(f"✅ Face detected! Found {len(face_locations)} face(s)")
        
        # Generate embeddings for detected faces
        face_encodings = face_recognition.face_encodings(test_image, face_locations)
        
        if len(face_encodings) == 0:
            print("❌ Could not generate embedding for detected face!")
            return False, face_locations[0]
        
        # Compare with reference (use first face)
        test_embedding = face_encodings[0]
        face_location = face_locations[0]
        
        # Calculate face distance (lower = more similar)
        # face_recognition uses euclidean distance, threshold is typically 0.6
        face_distance = face_recognition.face_distance([reference_embedding], test_embedding)[0]
        
        # face_recognition.compare_faces uses threshold of 0.6 by default
        # Lower distance = more similar
        is_match = face_distance <= 0.6
        
        print(f"📊 Face distance: {face_distance:.4f} (threshold: 0.6)")
        
        if is_match:
            print(f"✅ MATCH! This is {REFERENCE_NAME}")
        else:
            print(f"❌ NO MATCH - Unknown person")
        
        return is_match, face_location
        
    except Exception as e:
        print(f"❌ Error testing image: {e}")
        import traceback
        traceback.print_exc()
        return False, None


def draw_bounding_box(image_path, face_location, is_match, output_path=None):
    """Draw bounding box on image and save"""
    try:
        # Load image
        image = face_recognition.load_image_file(image_path)
        
        # Convert to PIL Image for drawing
        pil_image = Image.fromarray(image)
        draw = ImageDraw.Draw(pil_image)
        
        # Get face location (top, right, bottom, left)
        top, right, bottom, left = face_location
        
        # Draw bounding box
        # Green for match, red for no match
        color = (0, 255, 0) if is_match else (255, 0, 0)
        line_width = 3
        
        # Draw rectangle
        draw.rectangle(
            [(left, top), (right, bottom)],
            outline=color,
            width=line_width
        )
        
        # Add label
        label = REFERENCE_NAME if is_match else "Unknown"
        label_color = (0, 255, 0) if is_match else (255, 0, 0)
        
        # Draw label background
        label_size = 20
        draw.rectangle(
            [(left, top - label_size - 5), (right, top)],
            fill=color
        )
        
        # Draw label text
        try:
            from PIL import ImageFont
            # Try to use a default font
            font = ImageFont.load_default()
        except:
            font = None
        
        draw.text(
            (left + 5, top - label_size),
            label,
            fill=(255, 255, 255),
            font=font
        )
        
        # Save or show
        if output_path:
            pil_image.save(output_path)
            print(f"💾 Saved result image: {output_path}")
        else:
            # Save to same directory as input with _result suffix
            base_name = os.path.splitext(os.path.basename(image_path))[0]
            dir_name = os.path.dirname(image_path)
            output_path = os.path.join(dir_name, f"{base_name}_result.jpg")
            pil_image.save(output_path)
            print(f"💾 Saved result image: {output_path}")
        
        return output_path
        
    except Exception as e:
        print(f"❌ Error drawing bounding box: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    print("=" * 60)
    print("Face Recognition Test Script")
    print("=" * 60)
    
    # Load reference embedding
    reference_embedding = load_reference_embedding()
    
    if reference_embedding is None:
        print("\n❌ Failed to load reference embedding. Exiting.")
        return
    
    print(f"\n✅ Reference embedding loaded for: {REFERENCE_NAME}")
    print("\n" + "=" * 60)
    
    # Get test image path from command line or prompt
    if len(sys.argv) > 1:
        test_image_path = sys.argv[1]
    else:
        test_image_path = input("\nEnter path to test image: ").strip().strip('"')
    
    if not test_image_path:
        print("❌ No image path provided")
        return
    
    # Test the image
    is_match, face_location = test_image(test_image_path, reference_embedding)
    
    if face_location:
        # Draw bounding box
        print("\n📝 Drawing bounding box...")
        output_path = draw_bounding_box(test_image_path, face_location, is_match)
        
        print("\n" + "=" * 60)
        if is_match:
            print(f"✅ RESULT: This is {REFERENCE_NAME}")
        else:
            print("❌ RESULT: Unknown person")
        print("=" * 60)
    else:
        print("\n❌ Could not process image (no face detected)")


if __name__ == "__main__":
    main()


