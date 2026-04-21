import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getUserData, logAuditEvent, deleteEmployeeUser } from '../lib/utils';
import { getWeekForDate, getPreviousWeek, getNextWeek, formatWeekRange } from '../lib/weekUtils';
import { formatTime, formatTimeRange, calculateHours, formatHours, generateTimeOptions, timeStringToDate, timeRangesOverlap } from '../lib/timeUtils';
import { getCurrentWorkCycle, getWorkCycleForDate } from '../lib/workCycle';

export default function EmployeeDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const employeeId = params.employeeId as string;

  const [user, setUser] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(getWeekForDate(new Date()));
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [startTime, setStartTime] = useState('9:00 AM');
  const [endTime, setEndTime] = useState('5:00 PM');
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const timeOptions = generateTimeOptions();

  useEffect(() => {
    loadUserData();
    loadEmployeeData();
  }, []);

  useEffect(() => {
    loadTimeLogs();
  }, [selectedWeek, employeeId]);

  useEffect(() => {
    if (showManualEntry) {
      setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [showManualEntry, selectedDate]);

  async function loadUserData() {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      const userData = await getUserData(authUser.id);
      if (!userData || userData.role !== 'admin') {
        router.replace('/login');
        return;
      }
      setUser(userData);
    }
  }

  async function loadEmployeeData() {
    if (!employeeId) return;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (error) {
      Alert.alert('Error', 'Failed to load employee data');
      router.back();
      return;
    }

    setEmployee(data);
  }

  async function loadTimeLogs(weekOverride?: { start: Date; end: Date }) {
    if (!employeeId) {
      console.warn('⚠️ No employeeId, skipping loadTimeLogs');
      return;
    }

    const week = weekOverride ?? selectedWeek;
    try {
      const weekStart = week.start.toISOString();
      const weekEnd = week.end.toISOString();

      console.log('📥 Loading time logs:', {
        employeeId,
        weekStart,
        weekEnd
      });

      const { data, error } = await supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', employeeId)
        .gte('clock_in', weekStart)
        .lte('clock_in', weekEnd)
        .order('clock_in', { ascending: false });

      if (error) {
        console.error('❌ Load Time Logs Error:', error);
        Alert.alert('Error', `Failed to load time logs: ${error.message}`);
        setTimeLogs([]);
        return;
      }

      console.log(`✅ Loaded ${data?.length || 0} time logs`);
      setTimeLogs(data || []);
    } catch (err: any) {
      console.error('❌ Load Time Logs Exception:', err);
      setTimeLogs([]);
    }
  }

  async function handleManualClockIn() {
    if (!user || !employee) {
      Alert.alert('Error', 'User or employee data not loaded');
      return;
    }

    try {
      const now = new Date();
      const workCycle = getCurrentWorkCycle();

      console.log('🟢 Clock In - Inserting:', {
        user_id: employeeId,
        clock_in: now.toISOString(),
        work_cycle: workCycle
      });

      // Use employee's default cafe_location for admin manual clock-in
      const workLocation = employee?.cafe_location || null;

      const { data, error } = await supabase
        .from('time_logs')
        .insert({
          user_id: employeeId,
          clock_in: now.toISOString(),
          clock_out: null,
          work_cycle: workCycle,
          work_location: workLocation,
          verified_by: 'admin_manual',
        })
        .select();

      if (error) {
        console.error('❌ Clock In Error:', error);
        Alert.alert('Error', `Failed to clock in: ${error.message}`);
        return;
      }

      console.log('✅ Clock In Success:', data);

      // Log audit event (non-blocking)
      logAuditEvent('manual_clock_in', user.id, employeeId).catch(err => 
        console.warn('Audit log failed:', err)
      );

      Alert.alert('Success', 'Employee clocked in successfully');
      await loadTimeLogs();
    } catch (err: any) {
      console.error('❌ Clock In Exception:', err);
      Alert.alert('Error', `Unexpected error: ${err.message}`);
    }
  }

  async function handleManualClockOut() {
    if (!user || !employee) {
      Alert.alert('Error', 'User or employee data not loaded');
      return;
    }

    try {
      console.log('🔴 Clock Out - Finding active clock-in for:', employeeId);

      // Find active clock-in
      const { data: activeLog, error: findError } = await supabase
        .from('time_logs')
        .select('*')
        .eq('user_id', employeeId)
        .is('clock_out', null)
        .order('clock_in', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) {
        console.error('❌ Find Error:', findError);
        Alert.alert('Error', `Failed to find clock-in: ${findError.message}`);
        return;
      }

      if (!activeLog) {
        Alert.alert('Error', 'No active clock-in found');
        return;
      }

      console.log('✅ Found active clock-in:', activeLog.id);

      const now = new Date();
      console.log('🔄 Updating clock-out:', {
        id: activeLog.id,
        clock_out: now.toISOString()
      });

      const { data, error } = await supabase
        .from('time_logs')
        .update({ clock_out: now.toISOString() })
        .eq('id', activeLog.id)
        .select();

      if (error) {
        console.error('❌ Clock Out Error:', error);
        Alert.alert('Error', `Failed to clock out: ${error.message}`);
        return;
      }

      console.log('✅ Clock Out Success:', data);

      // Log audit event (non-blocking)
      logAuditEvent('manual_clock_out', user.id, employeeId).catch(err => 
        console.warn('Audit log failed:', err)
      );

      Alert.alert('Success', 'Employee clocked out successfully');
      await loadTimeLogs();
    } catch (err: any) {
      console.error('❌ Clock Out Exception:', err);
      Alert.alert('Error', `Unexpected error: ${err.message}`);
    }
  }

  async function handleSaveManualEntry() {
    setSaveError(null);
    console.log('💾 Save manual entry clicked', { hasUser: !!user, hasEmployee: !!employee });
    if (!user || !employee) {
      setSaveError('User or employee data not loaded');
      return;
    }

    try {
      const startDateTime = timeStringToDate(selectedDate, startTime);
      const endDateTime = timeStringToDate(selectedDate, endTime);

      console.log('💾 Save Manual Entry:', {
        editingLogId,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        selectedDate: selectedDate.toISOString(),
        startTime,
        endTime
      });

      if (endDateTime <= startDateTime) {
        setSaveError('End time must be after start time');
        return;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selectedDay = new Date(selectedDate);
      selectedDay.setHours(0, 0, 0, 0);
      const isPastDate = selectedDay.getTime() < today.getTime();

      // Only check overlaps when editing or when the date is today (skip for new past-date entries to avoid hang/slow select)
      if (editingLogId || !isPastDate) {
        console.log('💾 Save: checking overlaps...');
        const dayStart = new Date(selectedDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(selectedDate);
        dayEnd.setHours(23, 59, 59, 999);

        const { data: existingLogs, error: existingError } = await supabase
          .from('time_logs')
          .select('id, clock_in, clock_out')
          .eq('user_id', employeeId)
          .gte('clock_in', dayStart.toISOString())
          .lte('clock_in', dayEnd.toISOString());

        console.log('💾 Save: overlap query done', { count: existingLogs?.length ?? 0, err: existingError?.message });

        if (existingError) {
          console.warn('⚠️ Error checking overlaps:', existingError);
        }

        if (existingLogs) {
          for (const log of existingLogs) {
            if (log.id === editingLogId) continue;

            const logDay = new Date(log.clock_in);
            logDay.setHours(0, 0, 0, 0);
            if (!log.clock_out && logDay.getTime() < today.getTime()) continue;

            const logStart = new Date(log.clock_in);
            const logEnd = log.clock_out ? new Date(log.clock_out) : new Date();

            if (timeRangesOverlap(startDateTime, endDateTime, logStart, logEnd)) {
              setSaveError('Time entry overlaps with existing entry');
              return;
            }
          }
        }
      } else {
        console.log('💾 Save: skipping overlap check (past date, new entry)');
      }

      // Use work cycle for the selected date so past-date entries get the correct cycle
      const workCycle = getWorkCycleForDate(selectedDate);
      console.log('💾 Save: inserting/updating...');

      if (editingLogId) {
        // Update existing entry
        console.log('📝 Updating time entry:', editingLogId);
        const { data, error } = await supabase
          .from('time_logs')
          .update({
            clock_in: startDateTime.toISOString(),
            clock_out: endDateTime.toISOString(),
            verified_by: 'admin_manual',
          })
          .eq('id', editingLogId)
          .select();

        if (error) {
          console.error('❌ Update Error:', error);
          if (error.message?.includes('token') || error.message?.includes('session') || error.message?.includes('auth') || (error as any).status === 401) {
            setSaveError('Session expired. Please log in again.');
            supabase.auth.signOut().then(() => router.replace('/login'));
            return;
          }
          setSaveError(`Failed to update: ${error.message}`);
          return;
        }

        console.log('✅ Update Success:', data);

        // Log audit event (non-blocking)
        logAuditEvent('update_time_entry', user.id, employeeId).catch(err => 
          console.warn('Audit log failed:', err)
        );

        Alert.alert('Success', 'Time entry updated successfully');
      } else {
        // Create new entry
        console.log('📝 Creating new time entry');
        const { data, error } = await supabase
          .from('time_logs')
          .insert({
            user_id: employeeId,
            clock_in: startDateTime.toISOString(),
            clock_out: endDateTime.toISOString(),
            work_cycle: workCycle,
            verified_by: 'admin_manual',
          })
          .select();

        if (error) {
          console.error('❌ Insert Error:', error);
          if (error.message?.includes('token') || error.message?.includes('session') || error.message?.includes('auth') || (error as any).status === 401) {
            setSaveError('Session expired. Please log in again.');
            supabase.auth.signOut().then(() => router.replace('/login'));
            return;
          }
          setSaveError(`Failed to create: ${error.message}`);
          return;
        }

        console.log('✅ Insert Success:', data);

        // Log audit event (non-blocking)
        logAuditEvent('create_time_entry', user.id, employeeId).catch(err => 
          console.warn('Audit log failed:', err)
        );

        Alert.alert('Success', 'Time entry created successfully');
      }

      setSaveError(null);
      setShowManualEntry(false);
      setEditingLogId(null);
      // Switch to the week containing the saved date so the new/updated entry is visible
      const weekForSavedDate = getWeekForDate(selectedDate);
      setSelectedWeek(weekForSavedDate);
      await loadTimeLogs(weekForSavedDate);
    } catch (err: any) {
      console.error('❌ Save Manual Entry Exception:', err);
      setSaveError(err?.message ?? 'Unexpected error');
    }
  }

  async function handleDeleteEntry(logId: string) {
    console.log('🗑️ Delete button clicked, logId:', logId);
    console.log('   user:', user ? 'exists' : 'null');
    console.log('   employee:', employee ? 'exists' : 'null');

    if (!user || !employee) {
      Alert.alert('Error', 'User or employee data not loaded');
      return;
    }

    if (!logId) {
      Alert.alert('Error', 'Invalid time entry ID');
      return;
    }

    // Use different confirmation methods for web vs native
    if (Platform.OS === 'web') {
      const confirmed = (window as any).confirm('Are you sure you want to delete this time entry?');
      if (!confirmed) {
        console.log('❌ Delete cancelled by user (web)');
        return;
      }
      console.log('✅ User confirmed delete (web), starting deletion...');
      await performDelete(logId);
      return;
    } else {
      // For native, we'll use Alert.alert but handle it differently
      return new Promise<void>((resolve) => {
        Alert.alert(
          'Delete Time Entry',
          'Are you sure you want to delete this time entry?',
          [
            { 
              text: 'Cancel', 
              style: 'cancel',
              onPress: () => {
                console.log('❌ Delete cancelled by user (native)');
                resolve();
              }
            },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await performDelete(logId);
                resolve();
              }
            }
          ]
        );
      });
    }

    console.log('✅ User confirmed delete, starting deletion...');
    
    await performDelete(logId);
  }

  async function handleDeleteEmployee() {
    if (!user || !employee) {
      Alert.alert('Error', 'User or employee data not loaded');
      return;
    }

    if (employee.role !== 'employee') {
      Alert.alert('Error', 'Only employees can be deleted');
      return;
    }

    const confirmMessage =
      'This will permanently delete the employee and ALL related time logs. This cannot be undone.';

    if (Platform.OS === 'web') {
      const confirmed = (window as any).confirm(confirmMessage);
      if (!confirmed) return;
      await performDeleteEmployee();
      return;
    }

    Alert.alert('Delete Employee', confirmMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await performDeleteEmployee();
        },
      },
    ]);
  }

  async function performDeleteEmployee() {
    const result = await deleteEmployeeUser(employeeId);
    if (!result.success) {
      Alert.alert('Error', result.error || 'Failed to delete employee');
      return;
    }

    Alert.alert('Success', 'Employee deleted successfully');

    const cafeSlug =
      employee?.cafe_location?.toLowerCase().replace(/\s+/g, '-') || '';
    if (cafeSlug) {
      router.replace(`/cafe/${cafeSlug}`);
    } else {
      router.replace('/admin');
    }
  }

  async function performDelete(logId: string) {
    try {
      console.log('🗑️ Deleting time entry:', {
        logId,
        userId: user!.id,
        employeeId: employeeId
      });

      console.log('📡 Sending delete request to Supabase...');
      const { data, error } = await supabase
        .from('time_logs')
        .delete()
        .eq('id', logId)
        .select();

      console.log('📥 Delete response received:', { data, error });

      if (error) {
        console.error('❌ Delete Error:', error);
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        console.error('   Error details:', error.details);
        console.error('   Error hint:', error.hint);
        Alert.alert('Error', `Failed to delete: ${error.message}\n\nCode: ${error.code}`);
        return;
      }

      console.log('✅ Delete Success! Data:', data);
      console.log('🔄 Refreshing time logs...');

      // Log audit event (non-blocking)
      logAuditEvent('delete_time_entry', user.id, employeeId).catch(err => 
        console.warn('⚠️ Audit log failed:', err)
      );

      Alert.alert('Success', 'Time entry deleted successfully');
      console.log('📥 Calling loadTimeLogs()...');
      await loadTimeLogs();
      console.log('✅ loadTimeLogs() completed');
    } catch (err: any) {
      console.error('❌ Delete Exception:', err);
      console.error('   Exception stack:', err.stack);
      Alert.alert('Error', `Unexpected error: ${err.message || 'Unknown error'}`);
    }
  }

  function handleEditEntry(log: any) {
    const clockIn = new Date(log.clock_in);
    const clockOut = log.clock_out ? new Date(log.clock_out) : null;

    setSelectedDate(clockIn);
    setCalendarMonth(new Date(clockIn.getFullYear(), clockIn.getMonth(), 1));
    setStartTime(formatTime(clockIn));
    setEndTime(clockOut ? formatTime(clockOut) : '5:00 PM');
    setEditingLogId(log.id);
    setSaveError(null);
    setShowManualEntry(true);
  }

  function groupTimeLogsByDay() {
    const grouped: { [key: string]: any[] } = {};

    const getLocalDateKey = (dateValue: Date) => {
      const year = dateValue.getFullYear();
      const month = `${dateValue.getMonth() + 1}`.padStart(2, '0');
      const day = `${dateValue.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    timeLogs.forEach(log => {
      const date = new Date(log.clock_in);
      const dateKey = getLocalDateKey(date);

      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(log);
    });

    return grouped;
  }

  function getAutoClockOutCutoff(clockIn: Date, cafe: string | null): Date | null {
    if (!cafe) return null;
    const day = clockIn.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    const cutoff = new Date(clockIn);
    cutoff.setSeconds(0, 0);

    if (cafe === 'Hodge Hall') {
      if (day >= 1 && day <= 4) {
        cutoff.setHours(19, 30, 0, 0); // Mon-Thu 7:30 PM
        return cutoff;
      }
      if (day === 5) {
        cutoff.setHours(15, 30, 0, 0); // Fri 3:30 PM
        return cutoff;
      }
      return null;
    }

    if (cafe === 'Read Cafe') {
      cutoff.setHours(20, 30, 0, 0); // Sun-Sat 8:30 PM
      return cutoff;
    }

    return null;
  }

  function getEffectiveClockOut(
    clockInValue: Date | string,
    clockOutValue: Date | string | null,
    now: Date,
    workLocation: string | null
  ): Date {
    const clockIn = typeof clockInValue === 'string' ? new Date(clockInValue) : clockInValue;
    const fallbackEnd = clockOutValue
      ? (typeof clockOutValue === 'string' ? new Date(clockOutValue) : clockOutValue)
      : now;

    // Cap to the auto-clockout cutoff for the cafe they actually clocked in at
    // (fallback to the employee's home cafe). This protects against bad data
    // where a shift runs past its cutoff (e.g. edge function missed, forgot to
    // clock out). On days with no cutoff (weekends for Hodge), trust the value.
    const cafe = workLocation || employee?.cafe_location || null;
    const cutoff = getAutoClockOutCutoff(clockIn, cafe);
    if (!cutoff) return fallbackEnd;
    return fallbackEnd > cutoff ? cutoff : fallbackEnd;
  }

  function calculateTotalHours(): number {
    let total = 0;
    const now = new Date();

    timeLogs.forEach(log => {
      const effectiveClockOut = getEffectiveClockOut(
        log.clock_in,
        log.clock_out,
        now,
        log.work_location || null
      );
      const hours = calculateHours(log.clock_in, effectiveClockOut, now);
      total += hours;
    });

    return total;
  }

  function calculateDaysWorked(): number {
    const dates = new Set<string>();

    const getLocalDateKey = (dateValue: Date) => {
      const year = dateValue.getFullYear();
      const month = `${dateValue.getMonth() + 1}`.padStart(2, '0');
      const day = `${dateValue.getDate()}`.padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    timeLogs.forEach(log => {
      const date = new Date(log.clock_in);
      dates.add(getLocalDateKey(date));
    });

    return dates.size;
  }

  if (!employee) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  const groupedLogs = groupTimeLogsByDay();
  const totalHours = calculateTotalHours();
  const daysWorked = calculateDaysWorked();
  const renderNow = new Date();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{employee.name}</Text>
        <Text style={styles.subtitle}>{employee.email}</Text>
        {employee.cafe_location && (
          <Text style={styles.subtitle}>Location: {employee.cafe_location}</Text>
        )}

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

        {/* Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Hours:</Text>
            <Text style={styles.summaryValue}>{formatHours(totalHours)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Days Worked:</Text>
            <Text style={styles.summaryValue}>{daysWorked}</Text>
          </View>
        </View>

        {/* Admin Controls */}
        <View style={styles.controlsSection}>
          <View style={styles.controlsHeader}>
            <Text style={styles.sectionTitle}>Admin Controls</Text>
            <TouchableOpacity
              style={styles.deleteEmployeeLink}
              onPress={handleDeleteEmployee}
            >
              <Text style={styles.deleteEmployeeLinkText}>Delete Employee</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlButton, styles.clockInButton]}
              onPress={handleManualClockIn}
            >
              <Text style={styles.controlButtonText}>Clock In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, styles.clockOutButton]}
              onPress={handleManualClockOut}
            >
              <Text style={styles.controlButtonText}>Clock Out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, styles.addTimeButton]}
              onPress={() => {
                setEditingLogId(null);
                setSelectedDate(new Date());
                setCalendarMonth(new Date());
                setStartTime('9:00 AM');
                setEndTime('5:00 PM');
                setSaveError(null);
                setShowManualEntry(true);
              }}
            >
              <Text style={styles.controlButtonText}>Add Time</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Time Logs Grouped by Day */}
        <View style={styles.logsSection}>
          <Text style={styles.sectionTitle}>Time Logs</Text>
          {Object.entries(groupedLogs)
            .sort((a, b) => b[0].localeCompare(a[0])) // Sort by date descending
            .map(([dateKey, logs]) => {
              const [year, month, day] = dateKey.split('-').map(Number);
              const date = new Date(year, month - 1, day);
              return (
                <View key={dateKey} style={styles.dayGroup}>
                  <Text style={styles.dayHeader}>
                    {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </Text>
                  {logs.map((log) => (
                    <View key={log.id} style={styles.logItemContainer}>
                      <TouchableOpacity
                        style={styles.logItem}
                        onPress={() => handleEditEntry(log)}
                      >
                        <Text style={styles.logTime}>
                          {formatTimeRange(log.clock_in, getEffectiveClockOut(log.clock_in, log.clock_out, renderNow, log.work_location || null))}
                        </Text>
                        <Text style={styles.logVerified}>Verified: {log.verified_by}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteLogButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          console.log('Delete button pressed for log:', log.id);
                          handleDeleteEntry(log.id);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.deleteLogButtonText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
          {Object.keys(groupedLogs).length === 0 && (
            <Text style={styles.noDataText}>No time logs for this week</Text>
          )}
        </View>
      </View>

      {/* Manual Time Entry Modal */}
      <Modal
        visible={showManualEntry}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowManualEntry(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingLogId ? 'Edit Time Entry' : 'Add Time Entry'}
            </Text>

            {/* Date Picker */}
            <Text style={styles.modalLabel}>Date</Text>
            <TouchableOpacity
              style={styles.modalDateText}
              onPress={() => setShowCalendarPicker(true)}
            >
              <Text style={styles.modalDateTextValue}>
                {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </TouchableOpacity>

            {/* Start Time */}
            <Text style={styles.modalLabel}>Start Time</Text>
            <TouchableOpacity
              style={styles.timePickerButton}
              onPress={() => setShowStartTimePicker(true)}
            >
              <Text style={styles.timePickerText}>{startTime}</Text>
            </TouchableOpacity>

            {/* End Time */}
            <Text style={styles.modalLabel}>End Time</Text>
            <TouchableOpacity
              style={styles.timePickerButton}
              onPress={() => setShowEndTimePicker(true)}
            >
              <Text style={styles.timePickerText}>{endTime}</Text>
            </TouchableOpacity>

            {saveError ? (
              <View style={{ marginTop: 12, padding: 10, backgroundColor: '#fee', borderRadius: 8 }}>
                <Text style={{ color: '#c00', fontSize: 14 }}>{saveError}</Text>
              </View>
            ) : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowManualEntry(false);
                  setEditingLogId(null);
                  setSaveError(null);
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              {Platform.OS === 'web' ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSaveManualEntry();
                  }}
                  style={{
                    flex: 1,
                    padding: 15,
                    borderRadius: 8,
                    marginLeft: 5,
                    marginRight: 5,
                    backgroundColor: '#000',
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: 'bold',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
              ) : (
                <TouchableOpacity
                  style={[styles.modalButton, styles.saveButton]}
                  onPress={handleSaveManualEntry}
                >
                  <Text style={styles.modalButtonText}>Save</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modals */}
      {showCalendarPicker && (
        <Modal
          visible={showCalendarPicker}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowCalendarPicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.calendarModalContent}>
              <Text style={styles.modalTitle}>Select Date</Text>
              <View style={styles.calendarHeader}>
                <TouchableOpacity
                  style={styles.calendarNavButton}
                  onPress={() =>
                    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
                  }
                >
                  <Text style={styles.calendarNavText}>←</Text>
                </TouchableOpacity>
                <Text style={styles.calendarMonthText}>
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  style={styles.calendarNavButton}
                  onPress={() =>
                    setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
                  }
                >
                  <Text style={styles.calendarNavText}>→</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.calendarWeekRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <Text key={day} style={styles.calendarWeekday}>
                    {day}
                  </Text>
                ))}
              </View>
              <View style={styles.calendarGrid}>
                {(() => {
                  const year = calendarMonth.getFullYear();
                  const month = calendarMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const cells: (Date | null)[] = [];

                  for (let i = 0; i < firstDay; i += 1) {
                    cells.push(null);
                  }

                  for (let day = 1; day <= daysInMonth; day += 1) {
                    cells.push(new Date(year, month, day));
                  }

                  return cells.map((date, idx) => {
                    if (!date) {
                      return <View key={`empty-${idx}`} style={styles.calendarDayEmpty} />;
                    }

                    const isSelected =
                      date.getFullYear() === selectedDate.getFullYear() &&
                      date.getMonth() === selectedDate.getMonth() &&
                      date.getDate() === selectedDate.getDate();
                    const today = new Date();
                    const isToday =
                      date.getFullYear() === today.getFullYear() &&
                      date.getMonth() === today.getMonth() &&
                      date.getDate() === today.getDate();

                    return (
                      <TouchableOpacity
                        key={date.toISOString()}
                        style={[
                          styles.calendarDay,
                          isToday && styles.calendarDayToday,
                          isSelected && styles.calendarDaySelected,
                        ]}
                        onPress={() => {
                          setSelectedDate(date);
                          setShowCalendarPicker(false);
                        }}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            isSelected && styles.calendarDayTextSelected,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  });
                })()}
              </View>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowCalendarPicker(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {showStartTimePicker && (
        <Modal
          visible={showStartTimePicker}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowStartTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Start Time</Text>
              <ScrollView style={styles.timeOptionsList}>
                {timeOptions.map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={styles.timeOption}
                    onPress={() => {
                      setStartTime(time);
                      setShowStartTimePicker(false);
                    }}
                  >
                    <Text style={styles.timeOptionText}>{time}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowStartTimePicker(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {showEndTimePicker && (
        <Modal
          visible={showEndTimePicker}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowEndTimePicker(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select End Time</Text>
              <ScrollView style={styles.timeOptionsList}>
                {timeOptions.map((time) => (
                  <TouchableOpacity
                    key={time}
                    style={styles.timeOption}
                    onPress={() => {
                      setEndTime(time);
                      setShowEndTimePicker(false);
                    }}
                  >
                    <Text style={styles.timeOptionText}>{time}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setShowEndTimePicker(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  backButton: {
    marginBottom: 20,
  },
  backButtonText: {
    fontSize: 16,
    color: '#000',
    textDecorationLine: 'underline',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  weekSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 10,
    marginVertical: 20,
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
  summarySection: {
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  summaryLabel: {
    fontSize: 16,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  controlsSection: {
    marginBottom: 20,
  },
  controlsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  controlButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  clockInButton: {
    backgroundColor: '#4caf50',
  },
  clockOutButton: {
    backgroundColor: '#f44336',
  },
  addTimeButton: {
    backgroundColor: '#2196f3',
  },
  deleteEmployeeLink: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  deleteEmployeeLinkText: {
    color: '#d32f2f',
    fontSize: 14,
    fontWeight: 'bold',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  logsSection: {
    marginBottom: 20,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dayHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  logItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  logItem: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 8,
  },
  deleteLogButton: {
    backgroundColor: '#f44336',
    padding: 10,
    borderRadius: 8,
  },
  deleteLogButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logTime: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  logVerified: {
    fontSize: 14,
    color: '#666',
  },
  noDataText: {
    textAlign: 'center',
    color: '#999',
    marginTop: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 16,
    marginTop: 10,
    marginBottom: 5,
  },
  modalDateText: {
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    marginBottom: 10,
  },
  modalDateTextValue: {
    fontSize: 16,
    color: '#000',
  },
  calendarModalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxWidth: 420,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarNavButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  calendarNavText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  calendarMonthText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calendarWeekday: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  calendarDay: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 4,
  },
  calendarDayEmpty: {
    width: '14.28%',
    paddingVertical: 8,
    marginBottom: 4,
  },
  calendarDayToday: {
    backgroundColor: '#e8f0fe',
  },
  calendarDaySelected: {
    backgroundColor: '#000',
  },
  calendarDayText: {
    fontSize: 14,
    color: '#333',
  },
  calendarDayTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  timePickerButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    backgroundColor: '#f9f9f9',
    marginBottom: 10,
  },
  timePickerText: {
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#ccc',
  },
  saveButton: {
    backgroundColor: '#000',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  timeOptionsList: {
    maxHeight: 300,
  },
  timeOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  timeOptionText: {
    fontSize: 16,
  },
});

