import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getUserData, validateAdminCode } from '../lib/utils';
import { getCurrentWorkCycle } from '../lib/workCycle';
import { processImageForFaceRecognition, cosineSimilarity } from '../lib/faceRecognition';
import { isFaceRecognitionAvailable } from '../lib/platform';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { getCurrentWeek, getPreviousWeek, getNextWeek, formatWeekRange, getDayOfWeek } from '../lib/weekUtils';
import { formatTimeRange, calculateHours, formatHours, splitMultiDayTimeLog } from '../lib/timeUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const THRESHOLD = 0.90; // Same as test script

interface DayTimeData {
  day: string;
  timeRanges: string[];
  totalHours: number;
}

export default function ClockScreen() {
  const [user, setUser] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastClockIn, setLastClockIn] = useState<any>(null);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showBypassCode, setShowBypassCode] = useState(false);
  const [bypassCode, setBypassCode] = useState('');
  const [action, setAction] = useState<'clock_in' | 'clock_out'>('clock_in');
  const [loading, setLoading] = useState(false);
  const [faceAttempts, setFaceAttempts] = useState(0);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const router = useRouter();

  // Camera ref
  const cameraRef = useRef<CameraView>(null);

  // Recognition state
  const [recognitionResult, setRecognitionResult] = useState<{
    status: 'processing' | 'recognized' | 'not_recognized' | null;
    similarity: number;
    face_box: { x: number; y: number; w: number; h: number } | null;
  } | null>(null);

  useEffect(() => {
    loadUserData();
    loadLastClockIn();
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadTimeLogs();
    }
  }, [user, selectedWeek]);

  // Skip face recognition for admin users
  useEffect(() => {
    if (user?.role === 'admin') {
      // Admin doesn't need face recognition - clock button is always enabled
      setShowCamera(false);
    }
  }, [user]);

  async function loadUserData() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const userData = await getUserData(authUser.id);
      setUser(userData);
    }
  }

  async function loadLastClockIn() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      setIsClockedIn(false);
      setLastClockIn(null);
      return;
    }

    const currentWorkCycle = getCurrentWorkCycle();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    console.log('🔍 loadLastClockIn: Querying for active clock-in...');
    console.log('   - user_id:', authUser.id);
    console.log('   - work_cycle:', currentWorkCycle);
    console.log('   - clock_out: null');
    console.log('   - clock_in >=:', today.toISOString());

    const { data, error } = await supabase
      .from('time_logs')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('work_cycle', currentWorkCycle) // Only current work cycle
      .is('clock_out', null) // Only open clock-ins
      .gte('clock_in', today.toISOString()) // Only from today onwards
      .order('clock_in', { ascending: false })
      .limit(1)
      .single();

    if (data && !error) {
      console.log('✅ Found active clock-in:', data.id, 'clock_in:', data.clock_in, 'clock_out:', data.clock_out);
      setLastClockIn(data);
      setIsClockedIn(true);
    } else {
      console.log('ℹ️ No active clock-in found. Error:', error?.message || 'No records');
      // Explicitly set to false if no valid clock-in found
      setIsClockedIn(false);
      setLastClockIn(null);
    }
  }

  async function handleClockIn() {
    if (isClockedIn) {
      Alert.alert('Error', 'You are already clocked in');
      return;
    }

    // Admin users skip face recognition
    if (user?.role === 'admin') {
      await performClockAction('admin_code', null);
      return;
    }

    setAction('clock_in');
    setFaceAttempts(0);
    setRecognitionResult(null);
    
    if (!isFaceRecognitionAvailable) {
      Alert.alert(
        'Face Recognition Not Available',
        'Face recognition requires the mobile app. Please use bypass code.',
        [{ text: 'OK', onPress: () => setShowBypassCode(true) }]
      );
      return;
    }
    
    setShowCamera(true);
  }

  async function handleClockOut() {
    if (!isClockedIn) {
      Alert.alert('Error', 'You must clock in first');
      return;
    }

    // Admin users skip face recognition
    if (user?.role === 'admin') {
      await performClockAction('admin_code', null);
      return;
    }

    setAction('clock_out');
    setFaceAttempts(0);
    setRecognitionResult(null);
    
    if (!isFaceRecognitionAvailable) {
      Alert.alert(
        'Face Recognition Not Available',
        'Face recognition requires the mobile app. Please use bypass code.',
        [{ text: 'OK', onPress: () => setShowBypassCode(true) }]
      );
      return;
    }
    
    setShowCamera(true);
  }


  async function handleVerify() {
    if (!cameraRef.current) {
      Alert.alert('Error', 'Camera not ready');
      return;
    }

    setRecognitionResult({ status: 'processing', similarity: 0, face_box: null });
    setLoading(true);

    try {
      // Capture photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false, // We'll save to file instead
        skipProcessing: false,
      });

      if (!photo || !photo.uri) {
        Alert.alert('Error', 'Failed to capture photo');
        setRecognitionResult(null);
        setLoading(false);
        return;
      }

      // Save image locally (temporary storage)
      const timestamp = Date.now();
      const filename = `verify_${timestamp}.jpg`;
      const localUri = `${FileSystem.cacheDirectory}${filename}`;
      
      // Copy captured image to local storage
      await FileSystem.copyAsync({
        from: photo.uri,
        to: localUri,
      });

      console.log('✅ Image saved locally:', localUri);

      // Read image as base64 for processing
      const base64Data = await FileSystem.readAsStringAsync(localUri, {
        encoding: 'base64' as any,
      });

      // Process image to get embedding (128-dimensional face landmarks)
      const result = await processImageForFaceRecognition(localUri, base64Data);
      
      if (!result || !result.embedding) {
        const newAttempts = faceAttempts + 1;
        setFaceAttempts(newAttempts);
        setRecognitionResult({
          status: 'not_recognized',
          similarity: 0,
          face_box: null,
        });
        setLoading(false);
        return;
      }

      // Get stored embeddings (array of 4 embeddings)
      const { data: storedEmbedding, error: embeddingError } = await supabase
        .from('face_embeddings')
        .select('embedding')
        .eq('user_id', user.id)
        .single();

      if (embeddingError || !storedEmbedding) {
        Alert.alert('Error', 'No face enrollment found. Please contact admin.');
        setRecognitionResult(null);
        setLoading(false);
        return;
      }

      // Validate new embedding
      if (!Array.isArray(result.embedding) || result.embedding.length !== 128) {
        Alert.alert('Error', 'Invalid face embedding. Please try again.');
        setRecognitionResult(null);
        setLoading(false);
        return;
      }

      // Parse stored embeddings (JSONB array of arrays)
      let storedEmbeddings: number[][];
      try {
        // If it's already an array, use it directly; otherwise parse from JSON
        if (Array.isArray(storedEmbedding.embedding) && Array.isArray(storedEmbedding.embedding[0])) {
          storedEmbeddings = storedEmbedding.embedding;
        } else if (typeof storedEmbedding.embedding === 'string') {
          storedEmbeddings = JSON.parse(storedEmbedding.embedding);
        } else {
          // Legacy format: single embedding array, convert to array of arrays
          storedEmbeddings = [storedEmbedding.embedding];
        }
      } catch (error) {
        console.error('Failed to parse stored embeddings:', error);
        Alert.alert('Error', 'Invalid stored face data. Please re-enroll your face.');
        setRecognitionResult(null);
        setLoading(false);
        return;
      }

      // Validate stored embeddings
      if (!Array.isArray(storedEmbeddings) || storedEmbeddings.length === 0) {
        Alert.alert('Error', 'Invalid stored face data. Please re-enroll your face.');
        setRecognitionResult(null);
        setLoading(false);
        return;
      }

      // Compare new embedding against all stored embeddings
      // Find the best match (highest similarity)
      let bestSimilarity = -1;
      for (const storedEmb of storedEmbeddings) {
        if (!Array.isArray(storedEmb) || storedEmb.length !== 128) {
          console.warn('Invalid stored embedding format, skipping');
          continue;
        }
        
        const similarity = cosineSimilarity(result.embedding, storedEmb);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
        }
      }

      if (bestSimilarity === -1) {
        Alert.alert('Error', 'No valid stored embeddings found. Please re-enroll your face.');
        setRecognitionResult(null);
        setLoading(false);
        return;
      }

      const similarity = bestSimilarity;
      
      console.log('🔍 Face Recognition:', {
        similarity: (similarity * 100).toFixed(2) + '%',
        threshold: (THRESHOLD * 100).toFixed(0) + '%',
        match: similarity >= THRESHOLD ? '✅' : '❌',
      });

      if (similarity >= THRESHOLD) {
        // Face recognized
        setRecognitionResult({
          status: 'recognized',
          similarity,
          face_box: null,
        });
        // Enable clock button
        await performClockAction('face', null);
      } else {
        // Face not recognized
        const newAttempts = faceAttempts + 1;
        setFaceAttempts(newAttempts);
        setRecognitionResult({
          status: 'not_recognized',
          similarity,
          face_box: null,
        });
        setLoading(false);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
      setRecognitionResult(null);
      setLoading(false);
    }
  }

  async function handleBypassCodeSubmit() {
    if (!bypassCode || bypassCode.length !== 6) {
      Alert.alert('Error', 'Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);

    try {
      const isValid = await validateAdminCode(bypassCode, action, user?.id);
      
      if (!isValid) {
        Alert.alert('Error', 'Invalid or expired code');
        setLoading(false);
        return;
      }

      await performClockAction('admin_code', null);
    } catch (error: any) {
      Alert.alert('Error', error.message);
      setLoading(false);
    }
  }

  async function performClockAction(
    verifiedBy: 'face' | 'admin_code',
    matchedEmployeeId: string | null
  ) {
    setLoading(true);
    setShowBypassCode(false);
    setShowCamera(false);
    setBypassCode('');
    setRecognitionResult(null);

    try {
      const workCycle = getCurrentWorkCycle();
      const now = new Date().toISOString();

      if (action === 'clock_in') {
        const { error } = await supabase.from('time_logs').insert({
          user_id: user.id,
          clock_in: now,
          work_cycle: workCycle,
          verified_by: verifiedBy,
          flagged: matchedEmployeeId !== null && matchedEmployeeId !== user.id,
          flag_reason: matchedEmployeeId && matchedEmployeeId !== user.id
            ? 'Embedding matched another employee'
            : null,
          matched_employee_id: matchedEmployeeId,
        });

        if (error) {
          Alert.alert('Error', 'Failed to clock in');
          return;
        }

        Alert.alert('Success', 'Clocked in successfully');
        setIsClockedIn(true);
        await loadLastClockIn();
        await loadTimeLogs();
      } else {
        // Find the active clock-in record (more robust than using lastClockIn.id)
        const currentWorkCycle = getCurrentWorkCycle();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // First, find the active clock-in record
        const { data: activeClockIn, error: findError } = await supabase
          .from('time_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('work_cycle', currentWorkCycle)
          .is('clock_out', null)
          .gte('clock_in', today.toISOString())
          .order('clock_in', { ascending: false })
          .limit(1)
          .single();

        if (findError || !activeClockIn) {
          Alert.alert('Error', 'No active clock-in found');
          setLoading(false);
          // Refresh state from database
          await loadLastClockIn();
          return;
        }

        // Update the found record
        console.log('🔄 Updating clock out for record ID:', activeClockIn.id);
        const { error: updateError } = await supabase
          .from('time_logs')
          .update({
            clock_out: now,
            verified_by: verifiedBy,
            flagged: matchedEmployeeId !== null && matchedEmployeeId !== user.id,
            flag_reason: matchedEmployeeId && matchedEmployeeId !== user.id
              ? 'Embedding matched another employee'
              : null,
            matched_employee_id: matchedEmployeeId,
          })
          .eq('id', activeClockIn.id);

        if (updateError) {
          console.error('❌ Clock out update error:', updateError);
          Alert.alert('Error', 'Failed to clock out: ' + updateError.message);
          setLoading(false);
          await loadLastClockIn();
          return;
        }

        console.log('✅ Clock out update successful');
        
        // Update state immediately - trust the update succeeded since there was no error
        setIsClockedIn(false);
        setLastClockIn(null);
        console.log('🔄 State updated: isClockedIn = false');
        
        Alert.alert('Success', 'Clocked out successfully');
        
        // Refresh time logs to update the table
        await loadTimeLogs();
        
        // Verify in background (don't block UI or show errors to user)
        // If verification fails, loadLastClockIn() will correct the state on next check
        setTimeout(async () => {
          try {
            const { data: verifyData, error: verifyError } = await supabase
              .from('time_logs')
              .select('clock_out')
              .eq('id', activeClockIn.id)
              .maybeSingle();

            if (verifyError) {
              console.warn('⚠️ Background verification error:', verifyError);
            } else if (!verifyData || !verifyData.clock_out) {
              console.warn('⚠️ Background verification: clock_out is still null - update may have failed due to RLS');
              // Don't refresh state - keep isClockedIn = false since we set it
            } else {
              console.log('✅ Background verification successful - clock_out:', verifyData.clock_out);
            }
          } catch (err) {
            console.warn('⚠️ Background verification exception:', err);
          }
        }, 500);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
      // Refresh state from database on error
      await loadLastClockIn();
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeLogs() {
    if (!user) return;

    const weekStart = selectedWeek.start.toISOString();
    const weekEnd = selectedWeek.end.toISOString();

    console.log(`🔍 Loading time logs for user: ${user.id}`);
    console.log(`   Week: ${weekStart} to ${weekEnd}`);

    const { data, error } = await supabase
      .from('time_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('clock_in', weekStart)
      .lte('clock_in', weekEnd)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('❌ Error loading time logs:', error);
      setTimeLogs([]);
      return;
    }

    console.log(`✅ Loaded ${data?.length || 0} time logs`);
    setTimeLogs(data || []);
  }

  function processTimeLogsForTable(): DayTimeData[] {
    const dayDataMap: { [key: string]: DayTimeData } = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // Initialize all days
    days.forEach(day => {
      dayDataMap[day] = {
        day,
        timeRanges: [],
        totalHours: 0,
      };
    });

    console.log(`🔄 Processing ${timeLogs.length} time logs`);

    // Process time logs
    const now = new Date();
    timeLogs.forEach((log, index) => {
      try {
        const clockIn = new Date(log.clock_in);
        const clockOut = log.clock_out ? new Date(log.clock_out) : null;

        // Validate dates
        if (isNaN(clockIn.getTime())) {
          console.error(`❌ Invalid clock_in date for log ${index}:`, log.clock_in);
          return;
        }
        if (clockOut && isNaN(clockOut.getTime())) {
          console.error(`❌ Invalid clock_out date for log ${index}:`, log.clock_out);
          return;
        }

        // Check if log spans multiple days
        if (clockOut && clockIn.toDateString() !== clockOut.toDateString()) {
          // Split multi-day log
          const splitLogs = splitMultiDayTimeLog(clockIn, clockOut);
          
          splitLogs.forEach(splitLog => {
            const dayOfWeek = getDayOfWeek(splitLog.date);
            const dayName = days[dayOfWeek];
            const timeRange = formatTimeRange(splitLog.start, splitLog.end);
            const hours = calculateHours(splitLog.start, splitLog.end, now);

            if (dayDataMap[dayName]) {
              dayDataMap[dayName].timeRanges.push(timeRange);
              dayDataMap[dayName].totalHours += hours;
            }
          });
        } else {
          // Single day log
          const dayOfWeek = getDayOfWeek(clockIn);
          const dayName = days[dayOfWeek];
          
          // Check if in progress (no clock out)
          let timeRange: string;
          if (!clockOut) {
            timeRange = formatTimeRange(clockIn, now) + ' (In Progress)';
          } else {
            timeRange = formatTimeRange(clockIn, clockOut);
          }
          
          const hours = calculateHours(clockIn, clockOut, now);

          if (dayDataMap[dayName]) {
            dayDataMap[dayName].timeRanges.push(timeRange);
            dayDataMap[dayName].totalHours += hours;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing log ${index}:`, error, log);
      }
    });

    // Convert to array and calculate total
    const result = days.map(day => dayDataMap[day]);
    const totalHours = result.reduce((sum, day) => sum + day.totalHours, 0);
    console.log(`✅ Processed table data - Total hours: ${totalHours.toFixed(1)}`);
    return result;
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  // Admin users - skip face recognition
  if (user?.role === 'admin') {
    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
          <Text style={styles.timeText}>
            {currentTime.toLocaleTimeString()}
          </Text>
          <Text style={styles.dateText}>
            {currentTime.toLocaleDateString()}
          </Text>

          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              Status: {isClockedIn ? 'Clocked In' : 'Clocked Out'}
            </Text>
            {isClockedIn && lastClockIn && (
              <Text style={styles.clockInTime}>
                Since: {new Date(lastClockIn.clock_in).toLocaleTimeString()}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.clockButton,
              isClockedIn ? styles.clockOutButton : styles.clockInButton,
              loading && styles.buttonDisabled,
            ]}
            onPress={isClockedIn ? handleClockOut : handleClockIn}
            disabled={loading}
          >
            <Text style={styles.clockButtonText}>
              {loading
                ? 'Processing...'
                : isClockedIn
                ? 'Clock Out'
                : 'Clock In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <Text style={styles.logoutButtonText}>Logout</Text>
          </TouchableOpacity>

          {/* Weekly Hours Table */}
          <View style={styles.weeklyHoursSection}>
            <Text style={styles.sectionTitle}>Weekly Hours</Text>
            
            {/* Week Selector */}
            <View style={styles.weekSelector}>
              <TouchableOpacity
                style={styles.weekNavButton}
                onPress={() => setSelectedWeek(getPreviousWeek(selectedWeek.start))}
              >
                <Text style={styles.weekNavText}>← Previous</Text>
              </TouchableOpacity>
              <Text style={styles.weekText}>{formatWeekRange(selectedWeek.start, selectedWeek.end)}</Text>
              <TouchableOpacity
                style={styles.weekNavButton}
                onPress={() => setSelectedWeek(getNextWeek(selectedWeek.start))}
              >
                <Text style={styles.weekNavText}>Next →</Text>
              </TouchableOpacity>
            </View>

            {/* Table */}
            <View style={styles.tableContainer}>
              <View style={styles.tableHeader}>
                <View style={[styles.tableHeaderCell, styles.dayColumn]}>
                  <Text style={styles.tableHeaderText}>Day</Text>
                </View>
                <View style={[styles.tableHeaderCell, styles.timeColumn]}>
                  <Text style={styles.tableHeaderText}>Time</Text>
                </View>
                <View style={[styles.tableHeaderCell, styles.hoursColumn]}>
                  <Text style={styles.tableHeaderText}>Hours</Text>
                </View>
              </View>

              {processTimeLogsForTable().map((dayData, index) => (
                <View key={dayData.day} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                  <View style={[styles.tableCell, styles.dayColumn]}>
                    <Text style={styles.dayText}>{dayData.day.substring(0, 3)}</Text>
                  </View>
                  <View style={[styles.tableCell, styles.timeColumn]}>
                    {dayData.timeRanges.length > 0 ? (
                      dayData.timeRanges.map((timeRange, idx) => (
                        <Text key={idx} style={styles.timeRangeText} numberOfLines={1}>
                          {timeRange}
                        </Text>
                      ))
                    ) : (
                      <Text style={styles.emptyCellText}>-</Text>
                    )}
                  </View>
                  <View style={[styles.tableCell, styles.hoursColumn]}>
                    <Text style={styles.hoursText}>
                      {dayData.totalHours > 0 ? formatHours(dayData.totalHours) : '-'}
                    </Text>
                  </View>
                </View>
              ))}

              {/* Total Row */}
              <View style={styles.totalRow}>
                <View style={[styles.tableCell, styles.dayColumn]}>
                  <Text style={styles.totalText}>Total</Text>
                </View>
                <View style={[styles.tableCell, styles.timeColumn]}>
                  <Text style={styles.totalText}>-</Text>
                </View>
                <View style={[styles.tableCell, styles.hoursColumn]}>
                  <Text style={styles.totalText}>
                    {formatHours(processTimeLogsForTable().reduce((sum, day) => sum + day.totalHours, 0))}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    );
  }

  // Bypass code screen
  if (showBypassCode) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.title}>Bypass Code</Text>
          <Text style={styles.subtitle}>
            Call Tial for bypass code
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter 6-digit code"
            value={bypassCode}
            onChangeText={setBypassCode}
            keyboardType="number-pad"
            maxLength={6}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleBypassCodeSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Verifying...' : 'Submit'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => {
              setShowBypassCode(false);
              setBypassCode('');
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Camera screen with live detection
  if (showCamera) {
    return (
      <SimpleCameraView
        cameraRef={cameraRef}
        recognitionResult={recognitionResult}
        onVerify={handleVerify}
        onCancel={() => {
          setShowCamera(false);
          setRecognitionResult(null);
        }}
        onBypassCode={() => {
          setShowCamera(false);
          setShowBypassCode(true);
        }}
        loading={loading}
        verifyDisabled={loading || recognitionResult?.status === 'processing'}
      />
    );
  }

  // Main clock screen
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.welcomeText}>Welcome, {user?.name}</Text>
        <Text style={styles.timeText}>
          {currentTime.toLocaleTimeString()}
        </Text>
        <Text style={styles.dateText}>
          {currentTime.toLocaleDateString()}
        </Text>

        <View style={styles.statusBox}>
          <Text style={styles.statusText}>
            Status: {isClockedIn ? 'Clocked In' : 'Clocked Out'}
          </Text>
          {isClockedIn && lastClockIn && (
            <Text style={styles.clockInTime}>
              Since: {new Date(lastClockIn.clock_in).toLocaleTimeString()}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.clockButton,
            isClockedIn ? styles.clockOutButton : styles.clockInButton,
            loading && styles.buttonDisabled,
          ]}
          onPress={isClockedIn ? handleClockOut : handleClockIn}
          disabled={loading}
        >
          <Text style={styles.clockButtonText}>
            {loading
              ? 'Processing...'
              : isClockedIn
              ? 'Clock Out'
              : 'Clock In'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>

        {/* Weekly Hours Table */}
        <View style={styles.weeklyHoursSection}>
          <Text style={styles.sectionTitle}>Weekly Hours</Text>
          
          {/* Week Selector */}
          <View style={styles.weekSelector}>
            <TouchableOpacity
              style={styles.weekNavButton}
              onPress={() => setSelectedWeek(getPreviousWeek(selectedWeek.start))}
            >
              <Text style={styles.weekNavText}>← Previous</Text>
            </TouchableOpacity>
            <Text style={styles.weekText}>{formatWeekRange(selectedWeek.start, selectedWeek.end)}</Text>
            <TouchableOpacity
              style={styles.weekNavButton}
              onPress={() => setSelectedWeek(getNextWeek(selectedWeek.start))}
            >
              <Text style={styles.weekNavText}>Next →</Text>
            </TouchableOpacity>
          </View>

          {/* Table */}
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <View style={[styles.tableHeaderCell, styles.dayColumn]}>
                <Text style={styles.tableHeaderText}>Day</Text>
              </View>
              <View style={[styles.tableHeaderCell, styles.timeColumn]}>
                <Text style={styles.tableHeaderText}>Time</Text>
              </View>
              <View style={[styles.tableHeaderCell, styles.hoursColumn]}>
                <Text style={styles.tableHeaderText}>Hours</Text>
              </View>
            </View>

            {processTimeLogsForTable().map((dayData, index) => (
              <View key={dayData.day} style={[styles.tableRow, index % 2 === 0 && styles.tableRowEven]}>
                <View style={[styles.tableCell, styles.dayColumn]}>
                  <Text style={styles.dayText}>{dayData.day.substring(0, 3)}</Text>
                </View>
                <View style={[styles.tableCell, styles.timeColumn]}>
                  {dayData.timeRanges.length > 0 ? (
                    dayData.timeRanges.map((timeRange, idx) => (
                      <Text key={idx} style={styles.timeRangeText} numberOfLines={1}>
                        {timeRange}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.emptyCellText}>-</Text>
                  )}
                </View>
                <View style={[styles.tableCell, styles.hoursColumn]}>
                  <Text style={styles.hoursText}>
                    {dayData.totalHours > 0 ? formatHours(dayData.totalHours) : '-'}
                  </Text>
                </View>
              </View>
            ))}

            {/* Total Row */}
            <View style={styles.totalRow}>
              <View style={[styles.tableCell, styles.dayColumn]}>
                <Text style={styles.totalText}>Total</Text>
              </View>
              <View style={[styles.tableCell, styles.timeColumn]}>
                <Text style={styles.totalText}>-</Text>
              </View>
              <View style={[styles.tableCell, styles.hoursColumn]}>
                <Text style={styles.totalText}>
                  {formatHours(processTimeLogsForTable().reduce((sum, day) => sum + day.totalHours, 0))}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// Simple Camera Component for verification
function SimpleCameraView({
  cameraRef,
  recognitionResult,
  onVerify,
  onCancel,
  onBypassCode,
  loading,
  verifyDisabled,
}: {
  cameraRef: React.RefObject<CameraView>;
  recognitionResult: {
    status: 'processing' | 'recognized' | 'not_recognized' | null;
    similarity: number;
    face_box: { x: number; y: number; w: number; h: number } | null;
  } | null;
  onVerify: () => void;
  onCancel: () => void;
  onBypassCode: () => void;
  loading: boolean;
  verifyDisabled: boolean;
}) {
  const [permission, requestPermission] = useCameraPermissions();

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
        <Text>Camera permission required</Text>
        <TouchableOpacity onPress={requestPermission}>
          <Text>Grant Permission</Text>
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

      {/* Status overlay */}
      <View style={styles.cameraOverlay}>
        <View style={styles.statusContainer}>
          {recognitionResult?.status === 'processing' && (
            <Text style={styles.statusText}>Processing...</Text>
          )}
          {recognitionResult?.status === 'recognized' && (
            <Text style={[styles.statusText, styles.statusSuccess]}>
              Face Recognized ({(recognitionResult.similarity * 100).toFixed(1)}%)
            </Text>
          )}
          {recognitionResult?.status === 'not_recognized' && (
            <Text style={[styles.statusText, styles.statusError]}>
              Face Not Recognized ({(recognitionResult.similarity * 100).toFixed(1)}%)
            </Text>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.verifyButton,
              (verifyDisabled || loading) && styles.buttonDisabled,
            ]}
            onPress={onVerify}
            disabled={verifyDisabled || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bypassButton}
            onPress={onBypassCode}
          >
            <Text style={styles.bypassButtonText}>Use Bypass Code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  timeText: {
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  dateText: {
    fontSize: 20,
    textAlign: 'center',
    color: '#666',
    marginBottom: 40,
  },
  statusBox: {
    backgroundColor: '#f9f9f9',
    padding: 20,
    borderRadius: 10,
    marginBottom: 30,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  clockInTime: {
    fontSize: 16,
    color: '#666',
  },
  clockButton: {
    padding: 25,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  clockInButton: {
    backgroundColor: '#000',
  },
  clockOutButton: {
    backgroundColor: '#d32f2f',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  clockButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  logoutButton: {
    padding: 15,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#666',
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
  },
  button: {
    backgroundColor: '#000',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    marginTop: 15,
    padding: 15,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
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
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
    padding: 20,
  },
  statusContainer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 50,
  },
  statusText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statusSuccess: {
    color: '#00FF00',
  },
  statusError: {
    color: '#FF0000',
  },
  buttonContainer: {
    marginBottom: 50,
  },
  verifyButton: {
    backgroundColor: '#000',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  verifyButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bypassButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  bypassButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  weeklyHoursSection: {
    marginTop: 30,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  weekSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  weekNavButton: {
    padding: 10,
  },
  weekNavText: {
    fontSize: 16,
    color: '#000',
    fontWeight: 'bold',
  },
  weekText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#000',
  },
  tableHeaderCell: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  tableHeaderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dayColumn: {
    width: '25%',
  },
  timeColumn: {
    width: '50%',
  },
  hoursColumn: {
    width: '25%',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  tableRowEven: {
    backgroundColor: '#f9f9f9',
  },
  tableCell: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#eee',
    justifyContent: 'center',
    minHeight: 50,
  },
  dayText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  timeRangeText: {
    fontSize: 12,
    color: '#333',
    marginBottom: 3,
    fontWeight: '500',
  },
  emptyCellText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  hoursText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  totalRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderTopWidth: 2,
    borderTopColor: '#000',
  },
  totalText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
