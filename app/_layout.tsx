import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';

const PUBLIC_ROUTES = ['index', 'login', 'signup', 'clock'];

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Get initial session (handle refresh token failure)
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    }).catch(() => {
      setSession(null);
      setLoading(false);
    });

    // Listen for auth changes (e.g. Invalid Refresh Token clears session)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // When session is gone (e.g. Invalid Refresh Token), send to login if on a protected route
  useEffect(() => {
    if (loading) return;
    const firstSegment = segments[0];
    const isPublic = PUBLIC_ROUTES.includes(firstSegment);
    if (!session && !isPublic) {
      router.replace('/login');
    }
  }, [loading, session, segments]);

  if (loading) {
    return null; // Or a loading screen
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="clock" />
      <Stack.Screen name="admin" />
      <Stack.Screen name="sushi-orders" />
    </Stack>
  );
}










