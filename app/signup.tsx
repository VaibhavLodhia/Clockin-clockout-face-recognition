import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { isFaceRecognitionAvailable } from '../lib/platform';
import FaceEnrollment from '../components/FaceEnrollment';

type CafeLocation = 'Hodge Hall' | 'Read Cafe';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cafeLocation, setCafeLocation] = useState<CafeLocation | ''>('');
  const [showCafePicker, setShowCafePicker] = useState(false);
  const [showFaceEnrollment, setShowFaceEnrollment] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const EMPLOYEE_DEFAULT_PASSWORD = 'Employee@123';

  async function handleSignup() {
    if (!name || !email || !cafeLocation) {
      Alert.alert('Error', 'Please fill all fields including cafe location');
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (isWeb) {
      if (!password) {
        Alert.alert('Error', 'Please enter a password');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }
    }

    // On web, face enrollment is not available
    if (!isFaceRecognitionAvailable) {
      Alert.alert(
        'Face Enrollment Required',
        'Face enrollment requires the mobile app. Please use the mobile app to complete signup.',
        [{ text: 'OK' }]
      );
      return;
    }

    setShowFaceEnrollment(true);
  }

  async function handleFaceEnrollmentComplete(embeddings: number[][]) {
    setShowFaceEnrollment(false);
    await completeSignup(embeddings);
  }

  async function handleFaceEnrollmentCancel() {
    setShowFaceEnrollment(false);
    Alert.alert(
      'Face Enrollment Required',
      'Face enrollment is required for signup. Please try again.',
      [{ text: 'OK' }]
    );
  }

  async function completeSignup(embeddings: number[][] | null) {
    setLoading(true);

    try {
      // Trim and validate email
      const trimmedEmail = email.trim().toLowerCase();
      
      console.log('📝 Starting signup for:', trimmedEmail);
      console.log('🔧 Supabase URL configured:', !!supabase);
      
      // Create auth user with metadata
      const passwordToUse = isWeb ? password : EMPLOYEE_DEFAULT_PASSWORD;

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password: passwordToUse,
        options: {
          emailRedirectTo: undefined, // Disable email confirmation for now
          data: {
            name: name.trim(),
            cafe_location: cafeLocation,
          },
        },
      });

      if (authError) {
        console.error('❌ Signup error:', authError);
        console.error('   Error code:', authError.status);
        console.error('   Error message:', authError.message);
        
        // Better error messages
        let errorMessage = authError.message;
        if (authError.message.includes('invalid') || authError.message.includes('Invalid')) {
          errorMessage = 'Please enter a valid email address';
        } else if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
          errorMessage = 'This email is already registered. Please login instead.';
        } else if (authError.message.includes('Network') || authError.message.includes('network') || authError.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your internet connection and try again.';
        }
        Alert.alert('Error', errorMessage);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        Alert.alert('Error', 'Signup failed');
        setLoading(false);
        return;
      }

      // Wait for trigger to create user record automatically
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if user record exists (trigger should have created it)
      let retries = 0;
      let existingUser = null;
      
      while (retries < 5 && !existingUser) {
        const { data, error } = await supabase
          .from('users')
          .select('id, name')
          .eq('id', authData.user.id)
          .maybeSingle(); // Use maybeSingle to avoid error if not found
        
        if (data && !error) {
          existingUser = data;
          break;
        }
        
        // Wait a bit more and retry
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }

      if (existingUser) {
        // User exists (trigger created it), just update name if needed
        if (existingUser.name !== name.trim()) {
          const { error: updateError } = await supabase
            .from('users')
            .update({ name: name.trim() })
            .eq('id', authData.user.id);

          if (updateError) {
            console.error('User update error:', updateError);
            // Non-critical - user exists, name might be from metadata
          }
        }
        // User record exists, continue with success
      } else {
        // Trigger didn't work, try manual insert
        const { error: insertError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            name: name.trim(),
            email: trimmedEmail,
            role: 'employee',
            cafe_location: cafeLocation,
          });

        if (insertError) {
          // If duplicate key, user already exists (trigger created it) - this is expected and fine
          // Don't treat duplicate as an error - trigger already created the user
          if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique constraint') || insertError.message.includes('users_pkey')) {
            // User exists - trigger created it, this is expected behavior
            // Silently continue - this is not an error
          } else {
            // Real error (not duplicate) - log and show error
            console.error('User creation error:', insertError);
            let errorMessage = 'Failed to create user profile';
            if (insertError.message.includes('permission denied') || insertError.message.includes('RLS')) {
              errorMessage = 'Database permission error. Please check Supabase RLS policies.';
            } else if (insertError.message.includes('relation') && insertError.message.includes('does not exist')) {
              errorMessage = 'Database tables not set up. Please run schema.sql in Supabase.';
            } else {
              errorMessage = `Database error: ${insertError.message}`;
            }
            Alert.alert('Error', errorMessage);
            await supabase.auth.signOut();
            setLoading(false);
            return;
          }
        }
      }

      // Verify user record exists (trigger should have created it)
      // Retry a few times in case trigger is slow
      let userRecord = null;
      for (let i = 0; i < 3; i++) {
        const { data, error } = await supabase
          .from('users')
          .select('id, name')
          .eq('id', authData.user.id)
          .maybeSingle(); // Use maybeSingle to avoid error if not found
        
        if (data && !error) {
          userRecord = data;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (!userRecord) {
        // User record doesn't exist - trigger might have failed
        // Try one more manual insert
        const { error: lastAttempt } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            name: name.trim(),
            email: trimmedEmail,
            role: 'employee',
            cafe_location: cafeLocation,
          });

        if (lastAttempt && lastAttempt.code !== '23505' && !lastAttempt.message.includes('duplicate')) {
          // Real error
          Alert.alert('Error', 'Failed to create user profile. Please try again or contact admin.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }
        // If duplicate, user exists now - continue
        userRecord = { id: authData.user.id, name: name.trim() };
      }

      // Update name and cafe_location if they're different (trigger might have used email as name)
      if (userRecord) {
        const updates: { name?: string; cafe_location?: string } = {};
        if (userRecord.name !== name.trim()) {
          updates.name = name.trim();
        }
        // Update cafe_location
        const { data: currentUser } = await supabase
          .from('users')
          .select('cafe_location')
          .eq('id', authData.user.id)
          .single();
        
        if (currentUser?.cafe_location !== cafeLocation) {
          updates.cafe_location = cafeLocation;
        }
        
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('users')
            .update(updates)
            .eq('id', authData.user.id);
        }
      }

      // Store face embeddings if available
      if (embeddings && embeddings.length > 0) {
        // First try to delete existing embedding, then insert new one
        // This avoids upsert complexity
        await supabase
          .from('face_embeddings')
          .delete()
          .eq('user_id', authData.user.id);

        // Validate embeddings array
        if (!Array.isArray(embeddings) || embeddings.length !== 4) {
          console.error('Invalid embeddings format:', {
            isArray: Array.isArray(embeddings),
            length: embeddings?.length,
            type: typeof embeddings
          });
          throw new Error('Invalid face embeddings format: Expected 4 embeddings');
        }

        // Validate each embedding
        for (let i = 0; i < embeddings.length; i++) {
          if (!Array.isArray(embeddings[i]) || embeddings[i].length !== 128) {
            console.error(`Invalid embedding at index ${i}:`, {
              isArray: Array.isArray(embeddings[i]),
              length: embeddings[i]?.length,
            });
            throw new Error(`Invalid face embedding at position ${i + 1}: Expected 128 dimensions`);
          }
        }

        // Store as JSONB (array of arrays)
        const { error: embeddingError } = await supabase
          .from('face_embeddings')
          .insert({
            user_id: authData.user.id,
            embedding: embeddings, // Array of 4 embeddings, stored as JSONB
            model_version: 'face_recognition_v1',
          });

        if (embeddingError) {
          console.error('Failed to store embeddings:', embeddingError);
          // Don't fail signup if embedding storage fails
        }
      }

      // Success - user account created
      Alert.alert('Success', 'Account created successfully', [
        {
          text: 'OK',
          onPress: () => router.replace('/clock'),
        },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  if (showFaceEnrollment) {
    return (
      <FaceEnrollment
        onComplete={handleFaceEnrollmentComplete}
        onCancel={handleFaceEnrollmentCancel}
        maxAttempts={2}
      />
    );
  }


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Sign Up</Text>
        <Text style={styles.subtitle}>Create Employee Account</Text>

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        {isWeb && (
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#999"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
        )}

        {/* Cafe Location Picker */}
        <TouchableOpacity
          style={styles.pickerButton}
          onPress={() => setShowCafePicker(!showCafePicker)}
        >
          <Text style={[styles.pickerText, !cafeLocation && styles.pickerPlaceholder]}>
            {cafeLocation || 'Select Cafe Location'}
          </Text>
          <Text style={styles.pickerArrow}>{showCafePicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showCafePicker && (
          <View style={styles.pickerOptions}>
            <TouchableOpacity
              style={[
                styles.pickerOption,
                cafeLocation === 'Hodge Hall' && styles.pickerOptionSelected
              ]}
              onPress={() => {
                setCafeLocation('Hodge Hall');
                setShowCafePicker(false);
              }}
            >
              <Text style={[
                styles.pickerOptionText,
                cafeLocation === 'Hodge Hall' && styles.pickerOptionTextSelected
              ]}>
                Hodge Hall
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.pickerOption,
                cafeLocation === 'Read Cafe' && styles.pickerOptionSelected
              ]}
              onPress={() => {
                setCafeLocation('Read Cafe');
                setShowCafePicker(false);
              }}
            >
              <Text style={[
                styles.pickerOptionText,
                cafeLocation === 'Read Cafe' && styles.pickerOptionTextSelected
              ]}>
                Read Cafe
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Back to Login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
    color: '#000',
  },
  button: {
    backgroundColor: '#000',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  backButtonText: {
    color: '#000',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: {
    fontSize: 16,
    color: '#000',
  },
  pickerPlaceholder: {
    color: '#999',
  },
  pickerArrow: {
    fontSize: 12,
    color: '#666',
  },
  pickerOptions: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 15,
    overflow: 'hidden',
  },
  pickerOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pickerOptionSelected: {
    backgroundColor: '#f0f0f0',
  },
  pickerOptionText: {
    fontSize: 16,
    color: '#000',
  },
  pickerOptionTextSelected: {
    fontWeight: 'bold',
    color: '#000',
  },
});



