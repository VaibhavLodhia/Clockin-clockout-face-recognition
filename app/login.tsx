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
import { getUserData, resolveEmployeeLogin } from '../lib/utils';

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  const EMPLOYEE_DEFAULT_PASSWORD = 'Employee@123';

  async function handleLogin() {
    setLoading(true);

    try {
      if (isWeb) {
        if (!email || !password) {
          Alert.alert('Error', 'Please enter email and password');
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          Alert.alert('Error', error.message);
          return;
        }

        if (!data.user) {
          Alert.alert('Error', 'Login failed');
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        const userData = await getUserData(data.user.id);
        if (!userData) {
          Alert.alert('Error', 'User profile not found. Please contact admin.');
          console.error('User data not found for:', data.user.id);
          return;
        }

        if (userData.disabled) {
          Alert.alert('Error', 'Your account has been disabled');
          await supabase.auth.signOut();
          return;
        }

        if (userData.role === 'admin') {
          router.replace('/admin');
        } else {
          router.replace('/clock');
        }
        return;
      }

      if (!identifier.trim()) {
        Alert.alert('Error', 'Please enter your name or email');
        return;
      }

      const normalized = identifier.trim().toLowerCase();
      if (normalized === 'admin' || normalized === 'admin@gmail.com') {
        Alert.alert('Admin Login', 'Admin login is available on the web only.');
        return;
      }

      const resolved = await resolveEmployeeLogin(identifier.trim());
      if (resolved.error || !resolved.email) {
        Alert.alert('Error', resolved.error || 'Employee not found');
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: resolved.email,
        password: EMPLOYEE_DEFAULT_PASSWORD,
      });

      if (error) {
        Alert.alert('Error', error.message);
        return;
      }

      if (!data.user) {
        Alert.alert('Error', 'Login failed');
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      
      const userData = await getUserData(data.user.id);

      if (!userData) {
        Alert.alert('Error', 'User profile not found. Please contact admin.');
        console.error('User data not found for:', data.user.id);
        return;
      }

      if (userData.disabled) {
        Alert.alert('Error', 'Your account has been disabled');
        await supabase.auth.signOut();
        return;
      }

      if (userData.role !== 'employee') {
        Alert.alert('Error', 'Admin login is available on the web only.');
        await supabase.auth.signOut();
        return;
      }

      router.replace('/clock');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Employee Clock App</Text>
        <Text style={styles.subtitle}>Login</Text>

        {isWeb ? (
          <>
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

            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </>
        ) : (
          <TextInput
            style={styles.input}
            placeholder="Name or Email"
            placeholderTextColor="#999"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
          />
        )}

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Logging in...' : 'Login'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signupButton}
          onPress={() => router.push('/signup')}
        >
          <Text style={styles.signupText}>New Employee? Sign Up</Text>
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
    fontSize: 20,
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
  signupButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  signupText: {
    color: '#000',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});



