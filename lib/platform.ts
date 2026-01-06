import { Platform } from 'react-native';

// Check if running on web
export const isWeb = Platform.OS === 'web';

// Check if running on mobile (iOS or Android)
export const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

// Check if face recognition is available (only on mobile)
export const isFaceRecognitionAvailable = isMobile;







