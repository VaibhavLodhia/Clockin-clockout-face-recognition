import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getUserData } from '../lib/utils';

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      router.replace('/login');
      return;
    }

    // Wait a moment for user record to be available
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const userData = await getUserData(session.user.id);
    
    if (!userData) {
      // User authenticated but no profile - redirect to login
      await supabase.auth.signOut();
      router.replace('/login');
      return;
    }

    if (userData.role === 'admin') {
      router.replace('/admin');
    } else {
      router.replace('/clock');
    }
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#000" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});



