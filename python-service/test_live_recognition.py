# Live Face Recognition Test
# Uses webcam to detect faces and recognize if it matches Vaibhav
# Shows landmarks and recognition result on live screen

import cv2
import numpy as np
from pathlib import Path
import base64
from PIL import Image
import io

# Import functions from main.py
import sys
sys.path.append(str(Path(__file__).parent))
from main import (
    detect_face_opencv_dnn_with_info,
    generate_face_embedding_opencv,
    decode_base64_image,
    detect_facial_landmarks,
)

# Path to reference image
REFERENCE_IMAGE_PATH = r"C:\Users\Dell\Desktop\Vaibhav_Photo.jpg"
THRESHOLD = 0.90  # Recognition threshold (high threshold to reduce false positives)

# Global variable to store reference embedding
reference_embedding = None


def load_reference_embedding():
    """Load and generate embedding from reference image"""
    global reference_embedding
    
    if reference_embedding is not None:
        return reference_embedding
    
    print(f"Loading reference image: {REFERENCE_IMAGE_PATH}")
    
    if not Path(REFERENCE_IMAGE_PATH).exists():
        print(f"ERROR: Reference image not found: {REFERENCE_IMAGE_PATH}")
        return None
    
    try:
        # Read image
        image = cv2.imread(REFERENCE_IMAGE_PATH)
        if image is None:
            print("ERROR: Could not read image")
            return None
        
        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Generate embedding
        print("Generating reference embedding...")
        embedding = generate_face_embedding_opencv(image_rgb)
        
        if embedding is None:
            print("ERROR: Could not generate embedding from reference image")
            return None
        
        reference_embedding = embedding
        print(f"✅ Reference embedding generated: {len(embedding)} dimensions")
        return embedding
        
    except Exception as e:
        print(f"ERROR loading reference: {e}")
        import traceback
        traceback.print_exc()
        return None


def cosine_similarity(emb1, emb2):
    """Calculate cosine similarity between two embeddings"""
    if len(emb1) != len(emb2):
        return 0.0
    
    # Convert to numpy arrays
    emb1 = np.array(emb1, dtype=np.float32)
    emb2 = np.array(emb2, dtype=np.float32)
    
    # Check if embeddings are valid (not all zeros)
    if np.all(emb1 == 0) or np.all(emb2 == 0):
        return 0.0
    
    # Check for NaN or Inf values
    if np.any(np.isnan(emb1)) or np.any(np.isnan(emb2)):
        return 0.0
    if np.any(np.isinf(emb1)) or np.any(np.isinf(emb2)):
        return 0.0
    
    dot_product = np.dot(emb1, emb2)
    norm1 = np.linalg.norm(emb1)
    norm2 = np.linalg.norm(emb2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    similarity = dot_product / (norm1 * norm2)
    
    # Clamp to valid range [-1, 1]
    similarity = max(-1.0, min(1.0, similarity))
    
    return similarity


def draw_landmarks(frame, landmarks, face_box):
    """Draw facial landmarks on frame"""
    if landmarks is None or face_box is None:
        return
    
    x, y, w, h = face_box
    h_frame, w_frame = frame.shape[:2]
    
    # Scale landmarks from normalized (0-1) to frame coordinates
    left_eye = (int(landmarks['left_eye'][0] * w_frame), int(landmarks['left_eye'][1] * h_frame))
    right_eye = (int(landmarks['right_eye'][0] * w_frame), int(landmarks['right_eye'][1] * h_frame))
    nose = (int(landmarks['nose'][0] * w_frame), int(landmarks['nose'][1] * h_frame))
    mouth = (int(landmarks['mouth'][0] * w_frame), int(landmarks['mouth'][1] * h_frame))
    
    # Draw landmarks
    cv2.circle(frame, left_eye, 5, (0, 255, 0), -1)  # Green
    cv2.circle(frame, right_eye, 5, (0, 255, 0), -1)  # Green
    cv2.circle(frame, nose, 5, (255, 0, 0), -1)  # Blue
    cv2.circle(frame, mouth, 5, (0, 0, 255), -1)  # Red
    
    # Draw lines connecting landmarks
    cv2.line(frame, left_eye, right_eye, (255, 255, 0), 2)  # Cyan line between eyes
    cv2.line(frame, left_eye, nose, (255, 255, 0), 1)  # Cyan line left eye to nose
    cv2.line(frame, right_eye, nose, (255, 255, 0), 1)  # Cyan line right eye to nose
    cv2.line(frame, nose, mouth, (255, 255, 0), 1)  # Cyan line nose to mouth


def main():
    """Main function for live face recognition"""
    global reference_embedding
    
    # Load reference embedding
    reference_embedding = load_reference_embedding()
    if reference_embedding is None:
        print("ERROR: Could not load reference embedding. Exiting.")
        return
    
    # Initialize webcam
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("ERROR: Could not open webcam")
        return
    
    print("\n" + "="*50)
    print("LIVE FACE RECOGNITION TEST")
    print("="*50)
    print("Press 'q' to quit")
    print("Press 'r' to reload reference embedding")
    print("="*50 + "\n")
    
    # Set camera resolution for better performance
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    frame_count = 0
    last_result = None  # Cache last recognition result
    
    while True:
        ret, frame = cap.read()
        if not ret:
            print("ERROR: Could not read frame")
            break
        
        frame_count += 1
        
        # Process every 5th frame for better performance (was 3rd)
        # Also downscale frame for faster processing
        if frame_count % 5 != 0:
            # Use cached result from last processing
            if last_result is not None:
                face_box, detection_method, landmarks, is_match, similarity, embedding_valid, text, box_color, text_color, eye_color, nose_color, mouth_color, line_color = last_result
                
                if face_box is not None:
                    x, y, w, h = face_box
                    cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 2)
                    cv2.rectangle(frame, (x, y - 40), (x + w, y), box_color, -1)
                    cv2.putText(frame, text, (x + 10, y - 10), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, text_color, 2)
                    
                    if landmarks is not None:
                        h_face_orig, w_face_orig = frame[y:y+h, x:x+w].shape[:2] if y+h < frame.shape[0] and x+w < frame.shape[1] else (h, w)
                        scaled_landmarks = {
                            'left_eye': (x + int(landmarks['left_eye'][0] * w_face_orig), y + int(landmarks['left_eye'][1] * h_face_orig)),
                            'right_eye': (x + int(landmarks['right_eye'][0] * w_face_orig), y + int(landmarks['right_eye'][1] * h_face_orig)),
                            'nose': (x + int(landmarks['nose'][0] * w_face_orig), y + int(landmarks['nose'][1] * h_face_orig)),
                            'mouth': (x + int(landmarks['mouth'][0] * w_face_orig), y + int(landmarks['mouth'][1] * h_face_orig)),
                        }
                        cv2.circle(frame, scaled_landmarks['left_eye'], 8, eye_color, -1)
                        cv2.circle(frame, scaled_landmarks['right_eye'], 8, eye_color, -1)
                        cv2.circle(frame, scaled_landmarks['nose'], 8, nose_color, -1)
                        cv2.circle(frame, scaled_landmarks['mouth'], 8, mouth_color, -1)
                        cv2.line(frame, scaled_landmarks['left_eye'], scaled_landmarks['right_eye'], line_color, 2)
                        cv2.line(frame, scaled_landmarks['left_eye'], scaled_landmarks['nose'], line_color, 2)
                        cv2.line(frame, scaled_landmarks['right_eye'], scaled_landmarks['nose'], line_color, 2)
                        cv2.line(frame, scaled_landmarks['nose'], scaled_landmarks['mouth'], line_color, 2)
                else:
                    cv2.putText(frame, "No face detected", (10, 30), 
                               cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
            
            cv2.imshow('Live Face Recognition', frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('r'):
                reference_embedding = None
                reference_embedding = load_reference_embedding()
            continue
        
        # Downscale frame for faster processing (process at lower resolution)
        scale_factor = 0.5  # Process at 50% resolution for speed
        small_frame = cv2.resize(frame, (0, 0), fx=scale_factor, fy=scale_factor)
        
        # Convert BGR to RGB for processing
        frame_rgb = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
        
        # Detect face with detection method info (on downscaled frame)
        face_box, detection_method = detect_face_opencv_dnn_with_info(frame_rgb)
        
        # Scale face box coordinates back to original frame size
        if face_box is not None:
            x, y, w, h = face_box
            face_box = (int(x / scale_factor), int(y / scale_factor), 
                       int(w / scale_factor), int(h / scale_factor))
        
        if face_box is not None:
            x, y, w, h = face_box
            
            # Draw face bounding box
            cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 255), 2)
            
            # Generate embedding for recognition (use original full-size frame for better accuracy)
            full_frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Extract face region from full-size frame for embedding
            face_region_full = full_frame_rgb[y:y+h, x:x+w] if y+h < full_frame_rgb.shape[0] and x+w < full_frame_rgb.shape[1] else full_frame_rgb
            
            # Generate embedding on full-size face region
            embedding = generate_face_embedding_opencv(full_frame_rgb)  # Use full frame for better accuracy
            
            # Extract face region for landmark detection (from downscaled frame for speed)
            face_roi = frame_rgb[y:y+h, x:x+w] if y+h < frame_rgb.shape[0] and x+w < frame_rgb.shape[1] else frame_rgb
            
            # Detect landmarks (only if embedding succeeded, to save processing)
            landmarks = None
            h_face_orig, w_face_orig = h, w  # Default to face box size
            
            if embedding is not None and face_roi.size > 0:
                # Get original face dimensions
                h_face_orig, w_face_orig = face_roi.shape[:2]
                # Use smaller face region for landmark detection (faster)
                face_resized = cv2.resize(face_roi, (160, 160))
                face_gray = cv2.cvtColor(face_resized, cv2.COLOR_RGB2GRAY) if len(face_resized.shape) == 3 else face_resized
                landmarks = detect_facial_landmarks(face_gray)
            
            # Determine if face matches and set colors accordingly
            is_match = False
            similarity = 0.0
            embedding_valid = False
            
            if embedding is not None and reference_embedding is not None:
                # Validate embeddings are not all zeros
                emb_array = np.array(embedding, dtype=np.float32)
                ref_array = np.array(reference_embedding, dtype=np.float32)
                
                if not (np.all(emb_array == 0) or np.all(ref_array == 0)):
                    embedding_valid = True
                    similarity = cosine_similarity(embedding, reference_embedding)
                    is_match = similarity >= THRESHOLD
                else:
                    similarity = 0.0
                    is_match = False
            
            # Set landmark colors based on match status
            if is_match:
                # Match found - Vaibhav (Green theme)
                eye_color = (0, 255, 0)  # Green
                nose_color = (0, 200, 0)  # Darker green
                mouth_color = (0, 150, 0)  # Even darker green
                line_color = (0, 255, 100)  # Light green
                box_color = (0, 255, 0)  # Green box
                text = f"Vaibhav ({(similarity*100):.1f}%)"
                text_color = (0, 0, 0)  # Black text
            else:
                # No match - Unknown (Red/Orange theme)
                eye_color = (0, 0, 255)  # Red
                nose_color = (0, 100, 255)  # Orange
                mouth_color = (0, 150, 255)  # Light orange
                line_color = (0, 200, 255)  # Yellow-orange
                box_color = (0, 0, 255)  # Red box
                if embedding is None:
                    text = "Processing..."
                elif not embedding_valid:
                    text = "Invalid embedding"
                else:
                    text = f"Unknown ({(similarity*100):.1f}%)"
                text_color = (255, 255, 255)  # White text
            
            # Update bounding box color
            cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 2)
            
            # Draw text label with recognition result
            cv2.rectangle(frame, (x, y - 40), (x + w, y), box_color, -1)
            cv2.putText(frame, text, (x + 10, y - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, text_color, 2)
            
            # Draw detection method info below the face box
            method_text = f"Detected: {detection_method}"
            method_y = y + h + 20
            cv2.putText(frame, method_text, (x, method_y), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            
            # Draw similarity score info
            if embedding is not None and embedding_valid:
                score_text = f"Similarity: {(similarity*100):.1f}% (Threshold: {THRESHOLD*100:.0f}%)"
                status_color = (0, 255, 0) if is_match else (0, 0, 255)
                cv2.putText(frame, score_text, (x, method_y + 20), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, status_color, 1)
            elif embedding is not None:
                cv2.putText(frame, "Embedding validation failed", (x, method_y + 20), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
            
            # Cache result for skipped frames
            last_result = (face_box, detection_method, landmarks, is_match, similarity, 
                         embedding_valid, text, box_color, text_color, eye_color, 
                         nose_color, mouth_color, line_color)
            
            # Draw landmarks if detected
            if landmarks is not None:
                    # Get face dimensions for scaling (use actual face box size)
                    h_face_orig, w_face_orig = h, w
                    
                    # Scale landmarks to original face ROI size, then add face box offset
                    scaled_landmarks = {
                        'left_eye': (
                            x + int(landmarks['left_eye'][0] * w_face_orig),
                            y + int(landmarks['left_eye'][1] * h_face_orig)
                        ),
                        'right_eye': (
                            x + int(landmarks['right_eye'][0] * w_face_orig),
                            y + int(landmarks['right_eye'][1] * h_face_orig)
                        ),
                        'nose': (
                            x + int(landmarks['nose'][0] * w_face_orig),
                            y + int(landmarks['nose'][1] * h_face_orig)
                        ),
                        'mouth': (
                            x + int(landmarks['mouth'][0] * w_face_orig),
                            y + int(landmarks['mouth'][1] * h_face_orig)
                        ),
                    }
                    
                    # Draw landmarks with colors based on match status
                    cv2.circle(frame, scaled_landmarks['left_eye'], 8, eye_color, -1)  # Left eye
                    cv2.circle(frame, scaled_landmarks['right_eye'], 8, eye_color, -1)  # Right eye
                    cv2.circle(frame, scaled_landmarks['nose'], 8, nose_color, -1)  # Nose
                    cv2.circle(frame, scaled_landmarks['mouth'], 8, mouth_color, -1)  # Mouth
                    
                    # Draw lines connecting landmarks
                    cv2.line(frame, scaled_landmarks['left_eye'], scaled_landmarks['right_eye'], line_color, 2)  # Eye to eye
                    cv2.line(frame, scaled_landmarks['left_eye'], scaled_landmarks['nose'], line_color, 2)  # Left eye to nose
                    cv2.line(frame, scaled_landmarks['right_eye'], scaled_landmarks['nose'], line_color, 2)  # Right eye to nose
                    cv2.line(frame, scaled_landmarks['nose'], scaled_landmarks['mouth'], line_color, 2)  # Nose to mouth
        else:
            # No face detected
            cv2.putText(frame, "No face detected", (10, 30), 
                       cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        
        # Display frame
        cv2.imshow('Live Face Recognition', frame)
        
        # Handle keyboard input
        key = cv2.waitKey(1) & 0xFF
        if key == ord('q'):
            break
        elif key == ord('r'):
            reference_embedding = None
            reference_embedding = load_reference_embedding()
    
    # Cleanup
    cap.release()
    cv2.destroyAllWindows()
    print("\nExiting...")


if __name__ == "__main__":
    main()

