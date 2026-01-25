import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { processImageForFaceRecognition } from '../lib/faceRecognition';

interface FaceEnrollmentProps {
  onComplete: (embeddings: number[][]) => void; // Array of 4 embeddings
  onCancel: () => void;
  maxAttempts?: number;
}

export default function FaceEnrollment({
  onComplete,
  onCancel,
  maxAttempts = 2,
}: FaceEnrollmentProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState(0);
  const [capturedImages, setCapturedImages] = useState<string[]>([]); // Store local file URIs
  const [attempt, setAttempt] = useState(1);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const instructions = [
    'Position your face in the frame and tap Capture',
    'Turn your head slightly left and tap Capture',
    'Turn your head slightly right and tap Capture',
    'Tilt your head slightly upward and tap Capture',
  ];

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  async function captureFrame() {
    if (!cameraRef.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }

    setLoading(true);

    try {
      // Capture photo - CRITICAL: skipProcessing=true in production builds
      // Production builds apply additional processing that degrades image quality
      // skipProcessing=true gives us the raw camera output, which works better for face detection
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0, // MAXIMUM quality
        base64: false, // We'll save to file instead
        skipProcessing: true, // CRITICAL: Skip processing in production builds to preserve image quality
      });

      if (!photo || !photo.uri) {
        throw new Error('Failed to capture photo');
      }

      // Save image locally (temporary storage)
      const timestamp = Date.now();
      const filename = `face_capture_${step}_${timestamp}.jpg`;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      
      // Copy captured image to local storage
      await FileSystem.copyAsync({
        from: photo.uri,
        to: localUri,
      });

      console.log('✅ Image saved locally:', localUri);

      // Store the local file URI
      setCapturedImages((prev) => [...prev, localUri]);

      if (step < instructions.length - 1) {
        // Move to next step
        setStep(step + 1);
        setLoading(false);
      } else {
        // All 4 images captured, now process all of them
        setLoading(false);
        await processAllImages([...capturedImages, localUri]);
      }
    } catch (error: any) {
      console.error('Capture error:', error);
      Alert.alert('Error', 'Failed to capture image: ' + error.message);
      setLoading(false);
    }
  }

  async function processAllImages(imageUris: string[]) {
    setProcessing(true);

    try {
      const embeddings: number[][] = [];

      // Process each image to get embedding (face landmarks)
      for (let i = 0; i < imageUris.length; i++) {
        console.log(`📸 Processing image ${i + 1}/4...`);
        
        // Read image as base64 for processing
        const base64Data = await FileSystem.readAsStringAsync(imageUris[i], {
          encoding: 'base64' as any,
        });

        // Process image to get embedding (128-dimensional face landmarks)
        console.log(`📸 Processing image ${i + 1}/4 on ${Platform.OS}...`);
        console.log(`   Image size: ${Math.round(base64Data.length / 1024)} KB`);
        
        const result = await processImageForFaceRecognition(imageUris[i], base64Data);

        if (!result || !result.embedding) {
          let errorMessage = `Failed to process image ${i + 1}.`;
          switch (result?.errorType) {
            case 'NETWORK_ERROR':
              errorMessage =
                'Network error. Unable to reach the face recognition service. Check your internet connection and the service URL, then retry.';
              break;
            case 'SERVER_ERROR':
              errorMessage =
                `Server error while processing image ${i + 1}. Please try again.`;
              break;
            case 'CONFIG_ERROR':
              errorMessage =
                result?.errorMessage ||
                'Face recognition URL is not configured. Set the HTTPS service URL and rebuild.';
              break;
            case 'NO_FACE_DETECTED':
            default:
              errorMessage =
                `No face detected for image ${i + 1}. Please ensure good lighting and your face is centered.`;
              break;
          }

          Alert.alert(
            'Processing Failed',
            errorMessage,
            [
              {
                text: 'Retry',
                onPress: () => {
                  setProcessing(false);
                  setStep(0);
                  setCapturedImages([]);
                  setAttempt(attempt + 1);
                },
              },
              {
                text: 'Cancel',
                onPress: () => {
                  setProcessing(false);
                  onCancel();
                },
              },
            ]
          );
          return;
        }

        // Validate embedding (128 dimensions = face landmarks from face_recognition library)
        if (!Array.isArray(result.embedding) || result.embedding.length !== 128) {
          Alert.alert(
            'Processing Failed',
            `Invalid embedding for image ${i + 1}.`,
            [
              {
                text: 'Retry',
                onPress: () => {
                  setProcessing(false);
                  setStep(0);
                  setCapturedImages([]);
                  setAttempt(attempt + 1);
                },
              },
              {
                text: 'Cancel',
                onPress: () => {
                  setProcessing(false);
                  onCancel();
                },
              },
            ]
          );
          return;
        }

        embeddings.push(result.embedding);
        console.log(`✅ Embedding ${i + 1}/4 generated (128-dim face landmarks)`);
      }

      // All embeddings generated successfully
      if (embeddings.length === 4) {
        console.log('✅ All 4 embeddings generated successfully');
        setProcessing(false);
        onComplete(embeddings);
      } else {
        throw new Error('Expected 4 embeddings, got ' + embeddings.length);
      }
    } catch (error: any) {
      console.error('Processing error:', error);
      Alert.alert('Error', 'Failed to process images: ' + error.message);
      setProcessing(false);
      
      if (attempt >= maxAttempts) {
        Alert.alert(
          'Face Enrollment Failed',
          'Call Tial for bypass code',
          [
            {
              text: 'OK',
              onPress: () => onCancel(),
            },
          ]
        );
      } else {
        // Retry
        setStep(0);
        setCapturedImages([]);
        setAttempt(attempt + 1);
      }
    }
  }

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>Camera permission is required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="front"
      />
      <View style={styles.overlay}>
        <View style={styles.instructionBox}>
          <Text style={styles.instructionText}>
            {processing ? 'Processing images...' : instructions[step]}
          </Text>
          <Text style={styles.stepText}>
            {processing
              ? `Processing ${capturedImages.length + 1}/4`
              : `Step ${step + 1} of ${instructions.length}`}
          </Text>
        </View>

        <View style={styles.buttonContainer}>
          {processing ? (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.processingText}>Generating face embeddings...</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.captureButton, loading && styles.buttonDisabled]}
                onPress={captureFrame}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.captureButtonText}>Capture</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'space-between',
    padding: 20,
  },
  instructionBox: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 50,
  },
  instructionText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  stepText: {
    color: '#fff',
    fontSize: 16,
  },
  buttonContainer: {
    marginBottom: 50,
  },
  captureButton: {
    backgroundColor: '#000',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  processingContainer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 30,
    borderRadius: 10,
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 15,
  },
  text: {
    color: '#fff',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
