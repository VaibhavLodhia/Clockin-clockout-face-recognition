// Real Face Detection and Recognition using MLKit
// Works with react-native-vision-camera

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// For Expo, we'll use a hybrid approach:
// 1. Process images to detect faces
// 2. Extract facial landmarks
// 3. Generate embeddings from landmarks

// Face detection result
export interface FaceDetectionResult {
  faces: FaceData[];
}

export interface FaceData {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  landmarks: {
    leftEye: { x: number; y: number };
    rightEye: { x: number; y: number };
    nose: { x: number; y: number };
    mouth: { x: number; y: number };
    leftCheek?: { x: number; y: number };
    rightCheek?: { x: number; y: number };
  };
  confidence: number;
}

// Process MLKit face detection result from vision-camera-face-detector
// This extracts REAL face landmarks from MLKit
export function processMLKitFace(mlKitFace: any, imageWidth: number = 1.0, imageHeight: number = 1.0): FaceData | null {
  try {
    if (!mlKitFace) {
      return null;
    }

    // vision-camera-face-detector provides Face object with:
    // - bounds: { x, y, width, height } (already normalized 0-1)
    // - landmarks: object with leftEye, rightEye, noseBase, mouthLeft, mouthRight, mouthBottom, leftCheek, rightCheek
    //   Each landmark has: { x, y } (normalized 0-1)
    
    const bounds = mlKitFace.bounds || {};
    
    // Extract landmarks - these are REAL detected positions from MLKit
    const landmarks = mlKitFace.landmarks || {};
    
    // Validate essential landmarks exist
    if (!landmarks.leftEye || !landmarks.rightEye || !landmarks.noseBase) {
      console.warn('Missing essential landmarks - face detection incomplete');
      return null;
    }
    
    // MLKit provides REAL landmarks - extract them (already normalized 0-1)
    const faceData: FaceData = {
      boundingBox: {
        x: bounds.x || 0,
        y: bounds.y || 0,
        width: bounds.width || 0,
        height: bounds.height || 0,
      },
      landmarks: {
        leftEye: { x: landmarks.leftEye.x, y: landmarks.leftEye.y },
        rightEye: { x: landmarks.rightEye.x, y: landmarks.rightEye.y },
        nose: { x: landmarks.noseBase.x, y: landmarks.noseBase.y },
        mouth: landmarks.mouthBottom
          ? { x: landmarks.mouthBottom.x, y: landmarks.mouthBottom.y }
          : landmarks.mouthLeft && landmarks.mouthRight
          ? { x: (landmarks.mouthLeft.x + landmarks.mouthRight.x) / 2, y: (landmarks.mouthLeft.y + landmarks.mouthRight.y) / 2 }
          : { x: landmarks.noseBase.x, y: landmarks.noseBase.y + 0.15 }, // Estimate if missing
        leftCheek: landmarks.leftCheek
          ? { x: landmarks.leftCheek.x, y: landmarks.leftCheek.y }
          : undefined,
        rightCheek: landmarks.rightCheek
          ? { x: landmarks.rightCheek.x, y: landmarks.rightCheek.y }
          : undefined,
      },
      confidence: mlKitFace.trackingId ? 0.95 : 0.85, // High confidence - real MLKit detection
    };

    console.log('✅ REAL face detected using MLKit - landmarks:', {
      leftEye: faceData.landmarks.leftEye,
      rightEye: faceData.landmarks.rightEye,
      nose: faceData.landmarks.nose,
      mouth: faceData.landmarks.mouth,
    });
    return faceData;
  } catch (error) {
    console.error('Error processing MLKit face:', error);
    return null;
  }
}

// Process image to detect faces - this will be called from vision-camera frame processor
// For static images, we'll use a fallback
export async function detectFacesInImage(
  imageUri: string,
  base64?: string
): Promise<FaceData | null> {
  try {
    // This function is for static images
    // For real-time detection, use vision-camera frame processor which calls processMLKitFace
    
    let imageData: string;
    if (base64) {
      imageData = base64;
    } else {
      const fileData = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      imageData = fileData;
    }

    if (!imageData || imageData.length < 10000) {
      return null;
    }

    // For static images, we can't use vision-camera frame processor
    // This is a fallback - in production, process images through vision-camera
    // or use TensorFlow.js for static image processing
    
    console.warn('⚠️ Static image detection - use vision-camera frame processor for real detection');
    console.warn('⚠️ This is a fallback - real detection happens in camera frame processor');
    
    // Return null - real detection should happen in camera component
    return null;
  } catch (error) {
    console.error('Face detection error:', error);
    return null;
  }
}

// Generate embedding from face data
export function generateEmbeddingFromFace(face: FaceData): number[] {
  const embedding: number[] = [];

  // Extract facial features
  const { landmarks, boundingBox } = face;

  // Eye positions (normalized)
  embedding.push(landmarks.leftEye.x);
  embedding.push(landmarks.leftEye.y);
  embedding.push(landmarks.rightEye.x);
  embedding.push(landmarks.rightEye.y);

  // Eye distance (normalized)
  const eyeDistance = Math.sqrt(
    Math.pow(landmarks.leftEye.x - landmarks.rightEye.x, 2) +
    Math.pow(landmarks.leftEye.y - landmarks.rightEye.y, 2)
  );
  embedding.push(eyeDistance);

  // Nose position
  embedding.push(landmarks.nose.x);
  embedding.push(landmarks.nose.y);

  // Mouth position
  embedding.push(landmarks.mouth.x);
  embedding.push(landmarks.mouth.y);

  // Nose to mouth distance
  const noseMouthDistance = Math.sqrt(
    Math.pow(landmarks.nose.x - landmarks.mouth.x, 2) +
    Math.pow(landmarks.nose.y - landmarks.mouth.y, 2)
  );
  embedding.push(noseMouthDistance);

  // Face width/height ratio
  const faceAspectRatio = boundingBox.width / boundingBox.height;
  embedding.push(faceAspectRatio);

  // Cheek positions if available
  if (landmarks.leftCheek) {
    embedding.push(landmarks.leftCheek.x);
    embedding.push(landmarks.leftCheek.y);
  } else {
    embedding.push(0);
    embedding.push(0);
  }

  if (landmarks.rightCheek) {
    embedding.push(landmarks.rightCheek.x);
    embedding.push(landmarks.rightCheek.y);
  } else {
    embedding.push(0);
    embedding.push(0);
  }

  // Additional geometric features
  // Triangle: left eye, right eye, nose
  const eyeNoseLeft = Math.sqrt(
    Math.pow(landmarks.leftEye.x - landmarks.nose.x, 2) +
    Math.pow(landmarks.leftEye.y - landmarks.nose.y, 2)
  );
  const eyeNoseRight = Math.sqrt(
    Math.pow(landmarks.rightEye.x - landmarks.nose.x, 2) +
    Math.pow(landmarks.rightEye.y - landmarks.nose.y, 2)
  );
  embedding.push(eyeNoseLeft);
  embedding.push(eyeNoseRight);

  // Normalize embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) {
    return embedding;
  }

  return embedding.map(val => val / magnitude);
}

// Calculate cosine similarity
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

// Average embeddings
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return [];
  }

  const length = embeddings[0].length;
  const averaged = new Array(length).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < length; i++) {
      averaged[i] += embedding[i];
    }
  }

  for (let i = 0; i < length; i++) {
    averaged[i] /= embeddings.length;
  }

  // Normalize
  const magnitude = Math.sqrt(averaged.reduce((sum, val) => sum + val * val, 0));
  return averaged.map(val => val / magnitude);
}

