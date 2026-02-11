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
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { getUserData, generateAdminCode, logAuditEvent } from '../lib/utils';
import { getCurrentWorkCycle, isWorkCycleEnded, getPreviousWorkCycle } from '../lib/workCycle';


export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showGenerateCode, setShowGenerateCode] = useState(false);
  const [codeAction, setCodeAction] = useState<'clock_in' | 'clock_out'>('clock_in');
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [showCycleEndModal, setShowCycleEndModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    loadUserData();
  }, []);

  // Check if work cycle ended
  useEffect(() => {
    if (isWorkCycleEnded()) {
      setShowCycleEndModal(true);
    }
  }, []);

  async function loadUserData() {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.replace('/login');
        return;
      }

      const userData = await getUserData(authUser.id);
      if (!userData || userData.role !== 'admin') {
        router.replace('/login');
        return;
      }

      setUser(userData);
    } finally {
      setLoading(false);
    }
  }


  async function handleGenerateCode() {
    if (!user) {
      Alert.alert('Error', 'User not loaded');
      return;
    }

    try {
      console.log('🔑 Generating admin code for action:', codeAction);
      const code = await generateAdminCode(codeAction);
      
      if (code) {
        console.log('✅ Code generated:', code.code);
        setGeneratedCode(code.code);
      } else {
        console.error('❌ Failed to generate code');
        Alert.alert('Error', 'Failed to generate code. Please check console for details.');
      }
    } catch (error: any) {
      console.error('❌ Error generating code:', error);
      Alert.alert('Error', `Failed to generate code: ${error.message}`);
    }
  }

  async function handleExportCycle() {
    const previousCycle = getPreviousWorkCycle();
    
    const { data, error } = await supabase
      .from('time_logs')
      .select(`
        *,
        users!time_logs_user_id_fkey(name, email)
      `)
      .eq('work_cycle', previousCycle);

    if (error) {
      Alert.alert('Error', 'Failed to export data');
      return;
    }

    // Export logic would go here
    Alert.alert('Success', 'Data exported (CSV export to be implemented)');
  }

  async function handleDeleteCycle() {
    if (!user) return;

    Alert.alert(
      'Delete Work Cycle',
      'Are you sure you want to delete all data from the previous work cycle? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const previousCycle = getPreviousWorkCycle();

            const { error } = await supabase
              .from('time_logs')
              .delete()
              .eq('work_cycle', previousCycle);

            if (error) {
              Alert.alert('Error', 'Failed to delete cycle data');
              return;
            }

            await logAuditEvent('delete_work_cycle', user.id, null, {
              cycle: previousCycle,
            });
            setShowCycleEndModal(false);
            Alert.alert('Success', 'Work cycle data deleted');
          },
        },
      ]
    );
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }


  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <Text style={styles.subtitle}>Welcome, {user?.name}</Text>

        {/* Work Cycle End Modal */}
        <Modal
          visible={showCycleEndModal}
          animationType="slide"
          transparent={true}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Work Cycle Ended</Text>
              <Text style={styles.modalText}>
                Previous work cycle data is available for export or deletion.
              </Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={handleExportCycle}
              >
                <Text style={styles.modalButtonText}>Export as Excel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={handleDeleteCycle}
              >
                <Text style={styles.modalButtonText}>Delete Last Year Data</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowCycleEndModal(false)}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Generate Bypass Code Modal */}
        <Modal
          visible={showGenerateCode}
          animationType="slide"
          transparent={true}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Generate Bypass Code</Text>
              
              <Text style={styles.label}>Action:</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    codeAction === 'clock_in' && styles.radioButtonSelected,
                  ]}
                  onPress={() => setCodeAction('clock_in')}
                >
                  <Text style={codeAction === 'clock_in' ? styles.radioButtonTextSelected : styles.radioButtonText}>
                    Clock In
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.radioButton,
                    codeAction === 'clock_out' && styles.radioButtonSelected,
                  ]}
                  onPress={() => setCodeAction('clock_out')}
                >
                  <Text style={codeAction === 'clock_out' ? styles.radioButtonTextSelected : styles.radioButtonText}>
                    Clock Out
                  </Text>
                </TouchableOpacity>
              </View>

              {generatedCode ? (
                <View style={styles.codeDisplay}>
                  <Text style={styles.codeLabel}>Generated Code:</Text>
                  <Text style={styles.codeText}>{generatedCode}</Text>
                  <Text style={styles.codeNote}>Valid for 5 minutes</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleGenerateCode}
                >
                  <Text style={styles.modalButtonText}>Generate Code</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowGenerateCode(false);
                  setGeneratedCode('');
                }}
              >
                <Text style={styles.modalCancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Cafe Location Buttons */}
        <View style={styles.cafeButtonsSection}>
          <Text style={styles.sectionTitle}>View Cafe Schedule</Text>
          <TouchableOpacity
            style={styles.cafeButton}
            onPress={() => router.push('/cafe/hodge-hall')}
          >
            <Text style={styles.cafeButtonText}>Hodge Hall</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cafeButton}
            onPress={() => router.push('/cafe/read-cafe')}
          >
            <Text style={styles.cafeButtonText}>Read Cafe</Text>
          </TouchableOpacity>
        </View>

        {/* Bypass Code Button */}
        <TouchableOpacity
          style={styles.bypassCodeButton}
          onPress={() => setShowGenerateCode(true)}
        >
          <Text style={styles.bypassCodeButtonText}>Generate Bypass Code</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  cafeButtonsSection: {
    marginBottom: 20,
  },
  cafeButton: {
    backgroundColor: '#000',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  cafeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bypassCodeButton: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  bypassCodeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#666',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#000',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCancelButton: {
    padding: 15,
    alignItems: 'center',
    marginTop: 10,
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
  },
  label: {
    fontSize: 16,
    marginTop: 10,
    marginBottom: 5,
  },
  radioGroup: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  radioButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  radioButtonSelected: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  radioButtonText: {
    fontSize: 16,
    color: '#666',
  },
  radioButtonTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  codeDisplay: {
    backgroundColor: '#f9f9f9',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 16,
    marginBottom: 10,
  },
  codeText: {
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 5,
    marginBottom: 10,
  },
  codeNote: {
    fontSize: 14,
    color: '#666',
  },
});
