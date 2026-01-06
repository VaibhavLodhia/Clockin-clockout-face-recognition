// Real Face Recognition using MLKit Face Detection
// This will work with Expo and React Native

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

// Face detection result interface
interface FaceLandmark {
  x: number;
  y: number;
  z?: number;
}

interface DetectedFace {
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  headEulerAngleX?: number;
  headEulerAngleY?: number;
  headEulerAngleZ?: number;
  boundingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  landmarks: {
    leftEye?: { x: number; y: number };
    rightEye?: { x: number; y: number };
    noseBase?: { x: number; y: number };
    mouthLeft?: { x: number; y: number };
    mouthRight?: { x: number; y: number };
    mouthBottom?: { x: number; y: number };
    leftCheek?: { x: number; y: number };
    rightCheek?: { x: number; y: number };
  };
}

// Initialize face detection
export async function initializeFaceRecognition(): Promise<boolean> {
  // For now, we'll use a hybrid approach:
  // - Web: MediaPipe (already implemented)
  // - React Native: Will use MLKit via expo-camera frame processing
  // MLKit integration will be done in the camera components
  return true;
}

// Process image and extract face features using MLKit
// This will be called from camera components that have access to MLKit
export async function extractFaceFeaturesFromMLKit(
  face: DetectedFace
): Promise<number[] | null> {
  try {
    if (!face || !face.landmarks) {
      return null;
    }

    const embedding: number[] = [];

    // Extract key facial features from landmarks
    const landmarks = face.landmarks;

    // Left eye position
    if (landmarks.leftEye) {
      embedding.push(landmarks.leftEye.x);
      embedding.push(landmarks.leftEye.y);
    } else {
      embedding.push(0);
      embedding.push(0);
    }

    // Right eye position
    if (landmarks.rightEye) {
      embedding.push(landmarks.rightEye.x);
      embedding.push(landmarks.rightEye.y);
    } else {
      embedding.push(0);
      embedding.push(0);
    }

    // Nose position
    if (landmarks.noseBase) {
      embedding.push(landmarks.noseBase.x);
      embedding.push(landmarks.noseBase.y);
    } else {
      embedding.push(0);
      embedding.push(0);
    }

    // Mouth positions
    if (landmarks.mouthLeft) {
      embedding.push(landmarks.mouthLeft.x);
      embedding.push(landmarks.mouthLeft.y);
    } else {
      embedding.push(0);
      embedding.push(0);
    }

    if (landmarks.mouthRight) {
      embedding.push(landmarks.mouthRight.x);
      embedding.push(landmarks.mouthRight.y);
    } else {
      embedding.push(0);
      embedding.push(0);
    }

    if (landmarks.mouthBottom) {
      embedding.push(landmarks.mouthBottom.x);
      embedding.push(landmarks.mouthBottom.y);
    } else {
      embedding.push(0);
      embedding.push(0);
    }

    // Cheek positions
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

    // Face bounding box (normalized)
    if (face.boundingBox) {
      embedding.push(face.boundingBox.left);
      embedding.push(face.boundingBox.top);
      embedding.push(face.boundingBox.width);
      embedding.push(face.boundingBox.height);
    }

    // Head orientation
    if (face.headEulerAngleX !== undefined) {
      embedding.push(face.headEulerAngleX);
    } else {
      embedding.push(0);
    }
    if (face.headEulerAngleY !== undefined) {
      embedding.push(face.headEulerAngleY);
    } else {
      embedding.push(0);
    }
    if (face.headEulerAngleZ !== undefined) {
      embedding.push(face.headEulerAngleZ);
    } else {
      embedding.push(0);
    }

    // Eye open probabilities
    if (face.leftEyeOpenProbability !== undefined) {
      embedding.push(face.leftEyeOpenProbability);
    } else {
      embedding.push(0);
    }
    if (face.rightEyeOpenProbability !== undefined) {
      embedding.push(face.rightEyeOpenProbability);
    } else {
      embedding.push(0);
    }

    // Smiling probability
    if (face.smilingProbability !== undefined) {
      embedding.push(face.smilingProbability);
    } else {
      embedding.push(0);
    }

    // Calculate relative distances between key points (normalized)
    if (landmarks.leftEye && landmarks.rightEye) {
      const eyeDistance = Math.sqrt(
        Math.pow(landmarks.leftEye.x - landmarks.rightEye.x, 2) +
        Math.pow(landmarks.leftEye.y - landmarks.rightEye.y, 2)
      );
      embedding.push(eyeDistance);
    } else {
      embedding.push(0);
    }

    if (landmarks.noseBase && landmarks.mouthBottom) {
      const noseMouthDistance = Math.sqrt(
        Math.pow(landmarks.noseBase.x - landmarks.mouthBottom.x, 2) +
        Math.pow(landmarks.noseBase.y - landmarks.mouthBottom.y, 2)
      );
      embedding.push(noseMouthDistance);
    } else {
      embedding.push(0);
    }

    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) {
      return null;
    }

    const normalizedEmbedding = embedding.map(val => val / magnitude);
    
    console.log('Face features extracted from MLKit. Embedding size:', normalizedEmbedding.length);
    return normalizedEmbedding;
  } catch (error) {
    console.error('Failed to extract face features:', error);
    return null;
  }
}

// Calculate cosine similarity between two embeddings
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

// Average multiple embeddings into one
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

// Compare embedding with all stored embeddings
export async function findBestMatch(
  embedding: number[],
  storedEmbeddings: { userId: string; embedding: number[] }[],
  threshold: number = 0.8
): Promise<{ userId: string; score: number } | null> {
  let bestMatch: { userId: string; score: number } | null = null;
  let bestScore = 0;

  for (const stored of storedEmbeddings) {
    const score = cosineSimilarity(embedding, stored.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = { userId: stored.userId, score };
    }
  }

  if (bestScore >= threshold && bestMatch) {
    return bestMatch;
  }

  return null;
}







