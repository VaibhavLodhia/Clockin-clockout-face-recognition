import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import { supabase } from '../lib/supabase';
import { getUserData } from '../lib/utils';

type SushiOrder = {
  id: string;
  name: string;
  email: string;
  phone: string;
  details: string;
  created_at: string;
};

export default function SushiOrdersScreen() {
  const [orders, setOrders] = useState<SushiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkAdminAndLoadOrders();
  }, []);

  async function checkAdminAndLoadOrders() {
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

      const { data, error } = await supabase
        .from('sushi_orders')
        .select('id, name, email, phone, details, created_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading sushi orders:', error);
        setOrders([]);
      } else {
        setOrders(data ?? []);
      }
    } catch (e) {
      console.error(e);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  function escapeHtml(text: string) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch {
      return iso;
    }
  }

  /** Web: expo-print calls window.print() on the whole page — use iframe so only the receipt prints. */
  function printHtmlInIframe(html: string) {
    if (typeof document === 'undefined') return;
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Print order');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument ?? win?.document;
    if (!doc || !win) {
      document.body.removeChild(iframe);
      return;
    }
    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* ignore */
      }
    };
    doc.open();
    doc.write(html);
    doc.close();
    // Let the iframe layout before printing (avoids blank / whole-page issues)
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } finally {
        setTimeout(cleanup, 500);
      }
    }, 150);
  }

  async function handlePrintOrder(order: SushiOrder) {
    const printableDate = escapeHtml(formatDate(order.created_at));
    const safeName = escapeHtml(order.name);
    const safeEmail = escapeHtml(order.email);
    const safePhone = escapeHtml(order.phone);
    const safeDetails = escapeHtml(order.details).replace(/\n/g, '<br/>');

    const html = `
      <!DOCTYPE html>
      <html>
        <head><meta charset="utf-8"><title>Order</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h1 style="margin-bottom: 8px;">Sushi Order Details</h1>
          <p style="color:#666; margin-top:0;">${printableDate}</p>
          <hr />
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Phone:</strong> ${safePhone}</p>
          <p><strong>Order Details:</strong></p>
          <p>${safeDetails}</p>
        </body>
      </html>
    `;

    try {
      if (Platform.OS === 'web') {
        printHtmlInIframe(html);
        return;
      }
      await Print.printAsync({ html });
    } catch (e) {
      console.error('Failed to print order', e);
      Alert.alert('Error', 'Failed to open print dialog.');
    }
  }

  async function deleteOrder(order: SushiOrder) {
    const { error } = await supabase.from('sushi_orders').delete().eq('id', order.id);

    if (error) {
      console.error('Failed to delete order:', error);
      const msg = error.message || 'Could not mark order as delivered.';
      if (Platform.OS === 'web') {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert('Error', msg);
      }
      return;
    }

    setOrders((prev) => prev.filter((o) => o.id !== order.id));
  }

  function handleMarkDelivered(order: SushiOrder) {
    const message =
      'This will remove the order from dashboard and database. Continue?';

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Mark as Delivered?\n\n${message}`)) {
        void deleteOrder(order);
      }
      return;
    }

    Alert.alert('Mark as Delivered', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delivered',
        style: 'destructive',
        onPress: () => void deleteOrder(order),
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading orders...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back to Admin</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Sushi Orders</Text>
        <Text style={styles.subtitle}>
          Orders from the Sushi King website (bulk order form)
        </Text>

        {orders.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No sushi orders yet.</Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.card}>
              <Text style={styles.cardDate}>{formatDate(order.created_at)}</Text>
              <Text style={styles.cardName}>{order.name}</Text>
              <Text style={styles.cardRow}>Email: {order.email}</Text>
              <Text style={styles.cardRow}>Phone: {order.phone}</Text>
              <Text style={styles.cardDetails}>{order.details}</Text>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.printButton}
                  onPress={() => handlePrintOrder(order)}
                >
                  <Text style={styles.printButtonText}>Print Order Details</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deliveredButton}
                  onPress={() => handleMarkDelivered(order)}
                >
                  <Text style={styles.deliveredButtonText}>Delivered</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  backButton: {
    marginBottom: 20,
    paddingVertical: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '600',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  emptyBox: {
    padding: 24,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#000',
  },
  cardDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  cardRow: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  cardDetails: {
    fontSize: 14,
    color: '#333',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  printButton: {
    flex: 1,
    backgroundColor: '#000',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  printButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  deliveredButton: {
    flex: 1,
    backgroundColor: '#2e7d32',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  deliveredButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});
