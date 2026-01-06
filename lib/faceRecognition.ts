// Face Recognition - Uses Python OpenCV Service
// Reference: https://github.com/computervisioneng/face-attendance-system
// Logic: Send image to Python service → Get 128-dimensional embedding → Compare (one-to-many matching)

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

// Get Python service URL from environment variable
// For iOS Simulator, use 127.0.0.1 instead of localhost
// For physical device, use your computer's IP address
let defaultBaseUrl = 'http://127.0.0.1:8000';
if (Platform.OS === 'android') {
  // Android emulator uses special IP
  defaultBaseUrl = 'http://10.0.2.2:8000';
}

const BASE_URL = 
  process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL?.replace('/api/face-recognition', '') || 
  defaultBaseUrl;

const FACE_DETECTION_SERVICE_URL = `${BASE_URL}/api/face-detection`;
const FACE_RECOGNITION_SERVICE_URL = `${BASE_URL}/api/face-recognition`;

// Debug: Log the URL being used (only in development)
if (__DEV__) {
  console.log('🔧 Face Detection Service URL:', FACE_DETECTION_SERVICE_URL);
  console.log('🔧 Face Recognition Service URL:', FACE_RECOGNITION_SERVICE_URL);
  console.log('🔧 Environment variable:', process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL || 'NOT SET (using default)');
  console.log('🔧 Platform:', Platform.OS);
}

// Get Supabase session token for authentication
async function getAuthToken(): Promise<string | null> {
  try {
    // Import Supabase client
    const { supabase } = await import('./supabase');
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

// Test connection to Python service
export async function testPythonServiceConnection(): Promise<boolean> {
  try {
    const testUrl = BASE_URL;
    
    if (__DEV__) {
      console.log('🔍 Testing connection to:', testUrl);
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      if (__DEV__) {
        console.warn('⏱️ Connection test timeout');
      }
      controller.abort();
    }, 10000); // 10 second timeout
    
    const response = await fetch(testUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      if (__DEV__) {
        console.log('✅ Python service connection successful');
      }
      return true;
    } else {
      if (__DEV__) {
        console.error('❌ Python service returned status:', response.status);
      }
      return false;
    }
  } catch (error: any) {
    if (__DEV__) {
      if (error.name === 'AbortError') {
        console.error('⏱️ Connection test timed out');
      } else {
        console.error('❌ Connection test failed:', error.message || error);
      }
    }
    return false;
  }
}

// Call Python service for face detection (detection only, no embedding)
export async function detectFace(imageBase64: string): Promise<{ face_detected: boolean; face_box?: { x: number; y: number; w: number; h: number }; detection_method?: string } | null> {
  try {
    const token = await getAuthToken();
    
    if (!token) {
      console.warn('No auth token available, using test token');
    }

    // Prepare base64 image (remove data URL prefix if present)
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    // Log image size for debugging
    const imageSizeKB = Math.round(base64Data.length / 1024);
    console.log('📸 Face detection - Image size:', imageSizeKB, 'KB');
    console.log('📡 Calling face detection service:', FACE_DETECTION_SERVICE_URL);

    // Timeout for face detection (needs more time than recognition)
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error('⏱️ Face detection timeout after 20 seconds');
      controller.abort();
    }, 20000); // 20 seconds for detection
    
    const response = await fetch(FACE_DETECTION_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || 'test-token'}`,
      },
      body: JSON.stringify({
        image: base64Data,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Face detection service error:', response.status, errorText);
      return null;
    }

    const result = await response.json();

    if (result.success) {
      if (__DEV__) {
        console.log('✅ Face detection result:', result.face_detected ? 'Face detected' : 'No face');
      }
      return {
        face_detected: result.face_detected || false,
        face_box: result.face_box,
        detection_method: result.detection_method,
      };
    } else {
      return { face_detected: false };
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('⏱️ Face detection request aborted (timeout or cancelled)');
    } else {
      console.error('❌ Failed to call face detection service:', error.message || error);
    }
    return null;
  }
}

// Call Python service to generate face embedding
async function callPythonService(imageBase64: string): Promise<{ embedding: number[] | null; face_box?: { x: number; y: number; w: number; h: number }; detection_method?: string } | null> {
  try {
    const token = await getAuthToken();
    
    if (!token) {
      console.warn('No auth token available, using test token');
    }

    // Prepare base64 image (remove data URL prefix if present)
    const base64Data = imageBase64.includes(',') 
      ? imageBase64.split(',')[1] 
      : imageBase64;

    console.log('📡 Calling Python service at:', FACE_RECOGNITION_SERVICE_URL);
    console.log('📸 Image size:', base64Data.length, 'bytes');

    // Make API call to Python service
    // Add timeout and better error handling for iOS
    // Face recognition can take 10-20 seconds on first call (model loading)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000); // 45 second timeout
    
    const response = await fetch(FACE_RECOGNITION_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || 'test-token'}`,
      },
      body: JSON.stringify({
        image: base64Data,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Python service error:', response.status, errorText);
      console.error('💡 Make sure Python service is running on:', FACE_RECOGNITION_SERVICE_URL);
      return null;
    }

    const result = await response.json();

    if (result.success && result.embedding) {
      console.log('✅ Face embedding generated by Python service, size:', result.dimension);
      return {
        embedding: result.embedding,
        face_box: result.face_box,
        detection_method: result.detection_method,
      };
    } else {
      // "No face detected" is not an error - it's a normal response
      if (result.error === 'No face detected' || result.message?.includes('No face detected')) {
        console.log('⚠️ No face detected in image - please ensure face is clearly visible');
        return { embedding: null };
      }
      
      // Other errors are actual problems
      console.log('⚠️ Python service response:', result.message);
      if (result.error) {
        console.error('❌ Python service error:', result.error);
      }
      return { embedding: null };
    }
  } catch (error: any) {
    console.error('❌ Failed to call Python service:', error);
    
    // Check if it's a timeout
    if (error.name === 'AbortError') {
      console.error('⏱️ Request timeout - service took too long (>30s)');
      console.error('💡 Check if Python service is running and responsive');
      return null;
    }
    
    // Check if it's a network error
    if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
      console.error('🔴 Network error - service is not reachable');
      console.error('');
      console.error('💡 Troubleshooting steps:');
      console.error('   1. ✅ Python service is running (we confirmed this)');
      console.error('   2. Check .env file format:');
      console.error('      EXPO_PUBLIC_FACE_RECOGNITION_URL=http://127.0.0.1:8000/api/face-recognition');
      console.error('   3. For iOS Simulator: use http://127.0.0.1:8000/api/face-recognition');
      console.error('   4. For physical iOS device: use http://10.0.0.34:8000/api/face-recognition');
      console.error('   5. Restart Expo after changing .env: npx expo start --clear');
      console.error('');
      console.error('   Current URL being used:', FACE_RECOGNITION_SERVICE_URL);
      console.error('   Platform:', Platform.OS);
      
      // Test if we can reach the root endpoint
      try {
        const testUrl = FACE_RECOGNITION_SERVICE_URL.replace('/api/face-recognition', '');
        console.error('   Testing connection to:', testUrl);
        const testController = new AbortController();
        const testTimeout = setTimeout(() => testController.abort(), 5000);
        const testResponse = await fetch(testUrl, { 
          method: 'GET', 
          signal: testController.signal 
        });
        clearTimeout(testTimeout);
        if (testResponse.ok) {
          console.error('   ✅ Can reach service root - issue might be with POST request');
        } else {
          console.error('   ❌ Cannot reach service root');
        }
      } catch (testError) {
        console.error('   ❌ Cannot reach service at all');
      }
    } else {
      console.error('   Error details:', error.message);
    }
    
    return { embedding: null };
  }
}

// Process image for face recognition - MAIN FUNCTION
export async function processImageForFaceRecognition(
  imageUri: string,
  base64?: string
): Promise<{ embedding: number[] | null; face_box?: { x: number; y: number; w: number; h: number }; detection_method?: string } | null> {
  try {
    // Read image data
    let imageData: string;
    if (base64) {
      imageData = base64;
    } else {
      const fileData = await FileSystem.readAsStringAsync(imageUri, {
        encoding: 'base64' as any,
      });
      imageData = fileData;
    }

    // Validate image
    if (!imageData || imageData.length < 10000) {
      console.log('Image too small or invalid');
      return { embedding: null };
    }

    // Call Python service to generate embedding
    const result = await callPythonService(imageData);
    
    if (!result || !result.embedding || result.embedding.length === 0) {
      console.log('Failed to generate embedding from Python service');
      return { embedding: null, face_box: result?.face_box, detection_method: result?.detection_method };
    }
    
    console.log('✅ Real face embedding generated, size:', result.embedding.length);
    return {
      embedding: result.embedding,
      face_box: result.face_box,
      detection_method: result.detection_method,
    };
  } catch (error) {
    console.error('Failed to process image:', error);
    return { embedding: null };
  }
}

// Initialize face recognition (no-op for Python service)
export async function initializeFaceRecognition(): Promise<boolean> {
  // Python service handles initialization
  return true;
}

// Calculate cosine similarity between two embeddings
// Both embeddings should be L2-normalized (norm = 1.0)
// Returns value between -1 and 1, typically 0.7-0.95 for same person
export function cosineSimilarity(embedding1: number[], embedding2: number[]): number {
  // Validate inputs
  if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
    console.error('cosineSimilarity: Invalid input types');
    return 0;
  }

  if (embedding1.length !== embedding2.length) {
    console.error(`cosineSimilarity: Length mismatch: ${embedding1.length} vs ${embedding2.length}`);
    return 0;
  }

  if (embedding1.length === 0) {
    console.error('cosineSimilarity: Empty embeddings');
    return 0;
  }

  // Calculate dot product (for normalized vectors, this equals cosine similarity)
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    const val1 = embedding1[i];
    const val2 = embedding2[i];
    
    // Check for invalid values
    if (typeof val1 !== 'number' || typeof val2 !== 'number' || 
        isNaN(val1) || isNaN(val2) || !isFinite(val1) || !isFinite(val2)) {
      console.error(`cosineSimilarity: Invalid value at index ${i}: ${val1}, ${val2}`);
      return 0;
    }
    
    dotProduct += val1 * val2;
    norm1 += val1 * val1;
    norm2 += val2 * val2;
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0 || !isFinite(denominator)) {
    console.error('cosineSimilarity: Invalid denominator:', denominator);
    return 0;
  }

  const similarity = dotProduct / denominator;
  
  // Clamp to [-1, 1] range (should already be in this range for normalized vectors)
  return Math.max(-1, Math.min(1, similarity));
}

// Average multiple embeddings (for enrollment)
// All input embeddings should be L2-normalized
// Returns a new L2-normalized embedding
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    console.error('averageEmbeddings: Empty embeddings array');
    return [];
  }

  // Validate all embeddings have same length
  const length = embeddings[0].length;
  if (length !== 128) {
    console.error(`averageEmbeddings: Expected 128 dimensions, got ${length}`);
    return [];
  }

  for (const embedding of embeddings) {
    if (!Array.isArray(embedding) || embedding.length !== length) {
      console.error('averageEmbeddings: Inconsistent embedding lengths');
      return [];
    }
  }

  // Average the embeddings
  const averaged = new Array(length).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < length; i++) {
      averaged[i] += embedding[i];
    }
  }

  for (let i = 0; i < length; i++) {
    averaged[i] /= embeddings.length;
  }

  // L2 normalize the averaged embedding (CRITICAL for cosine similarity)
  const magnitude = Math.sqrt(averaged.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0 || !isFinite(magnitude)) {
    console.error('averageEmbeddings: Invalid magnitude:', magnitude);
    return [];
  }
  
  const normalized = averaged.map(val => val / magnitude);
  
  // Verify normalization
  const finalNorm = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
  if (Math.abs(finalNorm - 1.0) > 0.01) {
    console.warn(`averageEmbeddings: Normalization issue, norm: ${finalNorm}`);
  }
  
  return normalized;
}

// Find best match (one-to-many matching)
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