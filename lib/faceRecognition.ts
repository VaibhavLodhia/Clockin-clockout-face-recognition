 // Face Recognition - Uses Python OpenCV Service
// Reference: https://github.com/computervisioneng/face-attendance-system
// Logic: Send image to Python service → Get 128-dimensional embedding → Compare (one-to-many matching)

import * as FileSystem from 'expo-file-system';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';

type FaceServiceErrorType =
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'NO_FACE_DETECTED'
  | 'CONFIG_ERROR';

type FaceServiceResult =
  | {
      success: true;
      embedding: number[];
      face_box?: { x: number; y: number; w: number; h: number };
      detection_method?: string;
      faces_detected?: number;
    }
  | {
      success: false;
      errorType: FaceServiceErrorType;
      message: string;
      status?: number;
    };

// Get Python service URL - CRITICAL: In native builds, use Constants.expoConfig.extra
// process.env only works in web/dev, native builds need Constants.expoConfig.extra
const resolveFaceApiBaseUrl = (): { baseUrl: string; error?: string } => {
  // Try process.env first (works in web/dev)
  let url = process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL;
  
  // If not found, try Constants.expoConfig.extra (works in native builds from EAS env vars)
  if (!url && Constants.expoConfig?.extra?.faceRecognitionUrl) {
    url = Constants.expoConfig.extra.faceRecognitionUrl;
  }
  
  if (!url) {
    return {
      baseUrl: '',
      error: 'Face recognition URL is not configured. Set EXPO_PUBLIC_FACE_RECOGNITION_URL to your HTTPS service URL (https://vaibhavlodhiya-face-recognition-api.hf.space).',
    };
  }

  // Normalize: remove /api/face-recognition suffix and trailing slashes
  const normalized = url
    .replace(/\/api\/face-recognition\/?$/i, '')
    .replace(/\/+$/, '');

  if (!normalized.startsWith('https://')) {
    return {
      baseUrl: normalized,
      error:
        'Face recognition URL must be HTTPS for Android. Use your HTTPS service URL (https://vaibhavlodhiya-face-recognition-api.hf.space).',
    };
  }

  return { baseUrl: normalized };
};

const { baseUrl: FACE_API_BASE_URL, error: FACE_API_CONFIG_ERROR } =
  resolveFaceApiBaseUrl();

const FACE_DETECTION_SERVICE_URL = FACE_API_BASE_URL
  ? `${FACE_API_BASE_URL}/api/face-detection`
  : '';
const FACE_RECOGNITION_SERVICE_URL = FACE_API_BASE_URL
  ? `${FACE_API_BASE_URL}/api/face-recognition`
  : '';

// ALWAYS log the URL being used (critical for debugging production builds)
console.log('🔧 Face Detection Service URL:', FACE_DETECTION_SERVICE_URL || 'NOT SET');
console.log('🔧 Face Recognition Service URL:', FACE_RECOGNITION_SERVICE_URL || 'NOT SET');
console.log('🔧 process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL:', process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL || 'NOT SET');
console.log('🔧 Constants.expoConfig.extra.faceRecognitionUrl:', Constants.expoConfig?.extra?.faceRecognitionUrl || 'NOT SET');
console.log('🔧 Platform:', Platform.OS);
console.log('🔧 Base URL (final):', FACE_API_BASE_URL || 'NOT SET');
if (FACE_API_CONFIG_ERROR) {
  console.warn('⚠️ Face API config error:', FACE_API_CONFIG_ERROR);
}

// Show alert on first load with configuration (only once)
let configShown = false;
export function showFaceRecognitionConfig() {
  if (!configShown) {
    configShown = true;
    const envVar = process.env.EXPO_PUBLIC_FACE_RECOGNITION_URL || Constants.expoConfig?.extra?.faceRecognitionUrl || 'NOT SET';
    const configNote = FACE_API_CONFIG_ERROR ? `\n\nConfig Error: ${FACE_API_CONFIG_ERROR}` : '';
    Alert.alert(
      'Face Recognition Config',
      `Service URL: ${FACE_RECOGNITION_SERVICE_URL || 'NOT SET'}\n\nEnv Var: ${envVar}\nPlatform: ${Platform.OS}\n\nFrom Constants: ${Constants.expoConfig?.extra?.faceRecognitionUrl || 'NOT SET'}${configNote}`,
      [{ text: 'OK' }]
    );
  }
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
    const testUrl = FACE_API_BASE_URL;
    
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
    
    if (!testUrl) {
      if (__DEV__) {
        console.error('❌ Face API base URL not set');
      }
      return false;
    }

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
    if (FACE_API_CONFIG_ERROR || !FACE_DETECTION_SERVICE_URL) {
      console.error('❌ Face detection URL not configured:', FACE_API_CONFIG_ERROR || 'Missing URL');
      return null;
    }

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
const REQUEST_TIMEOUT_MS = 10000;
const NETWORK_RETRIES = 2;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callPythonService(imageBase64: string): Promise<FaceServiceResult> {
  if (FACE_API_CONFIG_ERROR || !FACE_RECOGNITION_SERVICE_URL) {
    return {
      success: false,
      errorType: 'CONFIG_ERROR',
      message: FACE_API_CONFIG_ERROR || 'Face recognition URL is not configured.',
    };
  }

  const token = await getAuthToken();
  if (!token) {
    console.warn('No auth token available, using test token');
  }

  const base64Data = imageBase64.includes(',')
    ? imageBase64.split(',')[1]
    : imageBase64;

  const body = JSON.stringify({ image: base64Data });

  for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(FACE_RECOGNITION_SERVICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || 'test-token'}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          errorType: 'SERVER_ERROR',
          status: response.status,
          message: `Server error ${response.status}: ${errorText.substring(0, 200) || 'Unknown error'}`,
        };
      }

      const result = await response.json();

      if (result?.success && Array.isArray(result.embedding)) {
        return {
          success: true,
          embedding: result.embedding,
          face_box: result.face_box,
          detection_method: result.detection_method,
          faces_detected: result.faces_detected,
        };
      }

      const errorText =
        result?.error || result?.message || 'Unknown server response';

      if (
        result?.error === 'NO_FACE_DETECTED' ||
        result?.message?.toLowerCase().includes('no face detected')
      ) {
        return {
          success: false,
          errorType: 'NO_FACE_DETECTED',
          message: 'No face detected in the image.',
        };
      }

      return {
        success: false,
        errorType: 'SERVER_ERROR',
        message: errorText,
      };
    } catch (error: any) {
      clearTimeout(timeout);
      const isTimeout = error?.name === 'AbortError';
      const message = isTimeout
        ? 'Network timeout. Unable to reach face recognition service.'
        : 'Network request failed. Unable to reach face recognition service.';

      if (attempt < NETWORK_RETRIES) {
        await sleep(500);
        continue;
      }

      return {
        success: false,
        errorType: 'NETWORK_ERROR',
        message,
      };
    }
  }

  return {
    success: false,
    errorType: 'NETWORK_ERROR',
    message: 'Network request failed. Unable to reach face recognition service.',
  };
}

// Process image for face recognition - MAIN FUNCTION
export async function processImageForFaceRecognition(
  imageUri: string,
  base64?: string
): Promise<{
  embedding: number[] | null;
  face_box?: { x: number; y: number; w: number; h: number };
  detection_method?: string;
  errorType?: FaceServiceErrorType;
  errorMessage?: string;
  status?: number;
} | null> {
  try {
    console.log(`🔍 Processing face recognition on ${Platform.OS}...`);
    if (FACE_API_CONFIG_ERROR) {
      return {
        embedding: null,
        errorType: 'CONFIG_ERROR',
        errorMessage: FACE_API_CONFIG_ERROR,
      };
    }
    
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
    const imageSizeKB = Math.round(imageData.length / 1024);
    console.log(`📸 Image size: ${imageSizeKB} KB`);
    
    if (!imageData || imageData.length < 10000) {
      console.error('❌ Image too small or invalid:', imageData.length, 'bytes');
      return {
        embedding: null,
        errorType: 'SERVER_ERROR',
        errorMessage: 'Captured image is too small or invalid.',
      };
    }

    // Call Python service to generate embedding
    console.log(`📡 Calling Python service from ${Platform.OS}...`);
    const result = await callPythonService(imageData);

    if (!result.success) {
      return {
        embedding: null,
        errorType: result.errorType,
        errorMessage: result.message,
        status: result.status,
      };
    }

    console.log(`✅ Face embedding generated on ${Platform.OS}, size:`, result.embedding.length);
    return {
      embedding: result.embedding,
      face_box: result.face_box,
      detection_method: result.detection_method,
    };
  } catch (error: any) {
    console.error(`❌ Failed to process image on ${Platform.OS}:`, error);
    console.error('   Error message:', error.message);
    return {
      embedding: null,
      errorType: 'NETWORK_ERROR',
      errorMessage: 'Network request failed. Unable to reach face recognition service.',
    };
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