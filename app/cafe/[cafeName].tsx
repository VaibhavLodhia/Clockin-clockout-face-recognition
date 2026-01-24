import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getUserData } from '../../lib/utils';
import { getCurrentWeek, getPreviousWeek, getNextWeek, formatWeekRange, getDayOfWeek } from '../../lib/weekUtils';
import { formatTimeRange, calculateHours, formatHours, splitMultiDayTimeLog } from '../../lib/timeUtils';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';

type CafeLocation = 'Hodge Hall' | 'Read Cafe';

interface EmployeeTimeData {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  sunday: string[];
  monday: string[];
  tuesday: string[];
  wednesday: string[];
  thursday: string[];
  friday: string[];
  saturday: string[];
  totalHours: number;
}

// Map URL slugs to cafe names
function getCafeNameFromSlug(slug: string): CafeLocation | null {
  const slugMap: { [key: string]: CafeLocation } = {
    'hodge-hall': 'Hodge Hall',
    'read-cafe': 'Read Cafe',
  };
  return slugMap[slug.toLowerCase()] || null;
}

export default function CafeSchedule() {
  const { cafeName } = useLocalSearchParams<{ cafeName: string }>();
  const [user, setUser] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [timeLogs, setTimeLogs] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());
  const router = useRouter();

  // Get cafe name from URL slug
  const selectedCafe = cafeName ? getCafeNameFromSlug(cafeName) : null;

  useEffect(() => {
    if (!selectedCafe) {
      Alert.alert('Error', 'Invalid cafe location');
      router.back();
      return;
    }
    loadUserData();
  }, [selectedCafe]);

  useEffect(() => {
    if (user && selectedCafe) {
      loadEmployees();
    }
  }, [selectedCafe, user]);

  useEffect(() => {
    if (employees.length > 0) {
      loadTimeLogs();
    } else {
      setTimeLogs([]);
    }
  }, [selectedCafe, selectedWeek, employees.length]);

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

  async function loadEmployees() {
    if (!selectedCafe || !user) return;

    try {
      console.log(`🔍 Loading employees for cafe: "${selectedCafe}"`);
      
      let { data, error } = await supabase
        .from('users')
        .select('id, name, email, cafe_location, role, disabled')
        .eq('role', 'employee')
        .eq('cafe_location', selectedCafe)
        .order('name');

      // If no results, try case-insensitive search
      if ((!data || data.length === 0) && !error) {
        console.log('⚠️ No exact match found, trying case-insensitive search...');
        const { data: caseInsensitiveData, error: caseError } = await supabase
          .from('users')
          .select('id, name, email, cafe_location, role, disabled')
          .eq('role', 'employee')
          .order('name');
        
        if (!caseError && caseInsensitiveData) {
          data = caseInsensitiveData.filter(emp => 
            emp.cafe_location && emp.cafe_location.toLowerCase() === selectedCafe.toLowerCase()
          );
          console.log(`✅ Found ${data.length} employees with case-insensitive match`);
        }
      }

      if (error) {
        console.error('❌ Error loading employees:', error);
        Alert.alert('Error', `Failed to load employees: ${error.message}`);
        return;
      }

      console.log(`✅ Loaded ${data?.length || 0} employees for "${selectedCafe}"`);
      setEmployees(data || []);
    } catch (err: any) {
      console.error('❌ Exception in loadEmployees:', err);
      Alert.alert('Error', `Failed to load employees: ${err.message}`);
    }
  }

  async function loadTimeLogs() {
    if (!selectedCafe) return;

    const weekStart = selectedWeek.start.toISOString();
    const weekEnd = selectedWeek.end.toISOString();

    const employeeIds = employees.map(emp => emp.id);

    if (employeeIds.length === 0) {
      console.log('⚠️ No employees found, clearing time logs');
      setTimeLogs([]);
      return;
    }

    console.log(`🔍 Loading time logs for ${employeeIds.length} employees`);
    console.log(`   Week: ${weekStart} to ${weekEnd}`);

    const { data, error } = await supabase
      .from('time_logs')
      .select('*')
      .in('user_id', employeeIds)
      .gte('clock_in', weekStart)
      .lte('clock_in', weekEnd)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('❌ Error loading time logs:', error);
      Alert.alert('Error', `Failed to load time logs: ${error.message}`);
      setTimeLogs([]);
      return;
    }

    console.log(`✅ Loaded ${data?.length || 0} time logs`);
    setTimeLogs(data || []);
  }

  function processTimeLogsForTable(): EmployeeTimeData[] {
    const employeeDataMap: { [key: string]: EmployeeTimeData } = {};

    // Initialize all employees
    employees.forEach(emp => {
      employeeDataMap[emp.id] = {
        employeeId: emp.id,
        employeeName: emp.name,
        employeeEmail: emp.email,
        sunday: [],
        monday: [],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        totalHours: 0,
      };
    });

    console.log(`🔄 Processing ${timeLogs.length} time logs for ${employees.length} employees`);

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
            const timeRange = formatTimeRange(splitLog.start, splitLog.end);
            const hours = calculateHours(splitLog.start, splitLog.end, now);

            if (employeeDataMap[log.user_id]) {
              const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek] as keyof EmployeeTimeData;
              (employeeDataMap[log.user_id][dayKey] as string[]).push(timeRange);
              employeeDataMap[log.user_id].totalHours += hours;
            }
          });
        } else {
          // Single day log
          const dayOfWeek = getDayOfWeek(clockIn);
          const timeRange = formatTimeRange(clockIn, clockOut || now);
          const hours = calculateHours(clockIn, clockOut, now);

          if (employeeDataMap[log.user_id]) {
            const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek] as keyof EmployeeTimeData;
            (employeeDataMap[log.user_id][dayKey] as string[]).push(timeRange);
            employeeDataMap[log.user_id].totalHours += hours;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing log ${index}:`, error, log);
      }
    });

    const result = Object.values(employeeDataMap).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    console.log(`✅ Processed table data for ${result.length} employees`);
    return result;
  }

  function formatTotalHoursForTable(hours: number): string {
    if (!Number.isFinite(hours) || hours <= 0) {
      return '0 hours';
    }

    if (hours < 1) {
      const minutes = Math.max(1, Math.round(hours * 60));
      return `${hours.toFixed(2)} hours (${minutes} min)`;
    }

    return `${hours.toFixed(1)} hours`;
  }

  async function handleDownloadWeeklyHours() {
    try {
      const start = selectedWeek.start;
      const end = selectedWeek.end;
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const startLabel = start.toLocaleDateString('en-US');
      const endLabel = end.toLocaleDateString('en-US');
      const startFile = startIso.split('T')[0];
      const endFile = endIso.split('T')[0];
      const cafeLabel = selectedCafe ? selectedCafe.replace(/\s+/g, '-') : 'cafe';
      const fileName = `weekly-hours_${cafeLabel}_${startFile}_to_${endFile}.xlsx`;

      const rows: (string | number)[][] = [
        ['Cafe', selectedCafe || 'Unknown'],
        ['Week Start', startLabel],
        ['Week End', endLabel],
        [],
        ['Employee', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Total'],
      ];

      const sortedRows = [...tableData].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
      sortedRows.forEach((row) => {
        const dayValues = dayKeys.map((dayKey) =>
          row[dayKey].length > 0 ? row[dayKey].join('\n') : '-'
        );
        rows.push([
          row.employeeName,
          ...dayValues,
          Number(row.totalHours.toFixed(2)),
        ]);
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Weekly Hours');

      if (Platform.OS === 'web') {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        Alert.alert('Success', 'Weekly hours downloaded');
      } else {
        const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(fileUri, wbout, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Weekly Hours Report',
        });
      }
    } catch (error: any) {
      Alert.alert('Error', `Failed to download report: ${error.message}`);
    }
  }

  if (!selectedCafe) {
    return null;
  }

  const tableData = processTimeLogsForTable();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/admin')}
        >
          <Text style={styles.backButtonText}>← Back to Dashboard</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{selectedCafe} - Weekly Schedule</Text>

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

        <TouchableOpacity
          style={styles.downloadExcelButton}
          onPress={handleDownloadWeeklyHours}
        >
          <Text style={styles.downloadExcelButtonText}>Download Weekly Excel</Text>
        </TouchableOpacity>

        {/* Weekly Table */}
        <View style={styles.tableSection}>
          <ScrollView horizontal={true} style={styles.tableScrollView}>
            <View style={styles.table}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <View style={[styles.tableHeaderCell, styles.employeeNameColumn]}>
                  <Text style={styles.tableHeaderText}>Employee</Text>
                </View>
                {days.map((day) => (
                  <View key={day} style={[styles.tableHeaderCell, styles.dayColumn]}>
                    <Text style={styles.tableHeaderText}>{day.substring(0, 3)}</Text>
                  </View>
                ))}
                <View style={[styles.tableHeaderCell, styles.totalColumn]}>
                  <Text style={styles.tableHeaderText}>Total</Text>
                </View>
              </View>

              {/* Table Rows */}
              {tableData.map((row) => (
                <TouchableOpacity
                  key={row.employeeId}
                  style={styles.tableRow}
                  onPress={() => router.push(`/employee-detail?employeeId=${row.employeeId}`)}
                >
                  <View style={[styles.tableCell, styles.employeeNameColumn]}>
                    <Text style={styles.employeeNameText} numberOfLines={2}>
                      {row.employeeName}
                    </Text>
                  </View>
                  {dayKeys.map((dayKey) => (
                    <View key={dayKey} style={[styles.tableCell, styles.dayColumn]}>
                      {row[dayKey].length > 0 ? (
                        row[dayKey].map((timeRange, idx) => (
                          <Text key={idx} style={styles.timeRangeText} numberOfLines={1}>
                            {timeRange}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.emptyCellText}>-</Text>
                      )}
                    </View>
                  ))}
                  <View style={[styles.tableCell, styles.totalColumn]}>
                    <Text style={styles.totalHoursText}>
                      {formatTotalHoursForTable(row.totalHours)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}

              {tableData.length === 0 && (
                <View style={styles.emptyTableRow}>
                  <Text style={styles.emptyTableText}>
                    No employees found for {selectedCafe}
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
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
    backgroundColor: '#666',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  weekSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
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
  downloadExcelButton: {
    backgroundColor: '#2e7d32',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  downloadExcelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  tableSection: {
    marginBottom: 20,
  },
  tableScrollView: {
    marginHorizontal: -20,
  },
  table: {
    minWidth: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#000',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tableHeaderCell: {
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  tableHeaderText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  employeeNameColumn: {
    width: 120,
    minWidth: 120,
  },
  dayColumn: {
    width: 120,
    minWidth: 120,
  },
  totalColumn: {
    width: 100,
    minWidth: 100,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  tableCell: {
    padding: 10,
    borderRightWidth: 1,
    borderRightColor: '#eee',
    justifyContent: 'center',
    minHeight: 60,
  },
  employeeNameText: {
    fontSize: 14,
    fontWeight: 'bold',
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
  totalHoursText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptyTableRow: {
    padding: 20,
    alignItems: 'center',
  },
  emptyTableText: {
    fontSize: 16,
    color: '#999',
  },
});

