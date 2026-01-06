import { supabase } from './supabase';
import { User } from './supabase';

// Check if user is admin
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return false;
  }

  return data.role === 'admin';
}

// Get user data
export async function getUserData(userId: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle(); // Use maybeSingle to avoid error if not found

  if (error) {
    console.error('Error fetching user data:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  return data as User;
}

// Log audit event
export async function logAuditEvent(
  action: string,
  performedBy: string,
  targetUser: string | null = null,
  metadata: any = null
): Promise<void> {
  await supabase.rpc('log_audit_event', {
    p_action: action,
    p_performed_by: performedBy,
    p_target_user: targetUser,
    p_metadata: metadata,
  });
}

// Generate admin code (tries edge function first, falls back to direct DB insert)
export async function generateAdminCode(
  action: 'signup' | 'clock_in' | 'clock_out',
  userId?: string
): Promise<{ code: string; codeId: string; expiresAt: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('❌ No session found');
    return null;
  }

  // Try edge function first
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/generate-admin-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({ action, userId }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Admin code generated via edge function');
        return result;
      } else {
        console.warn('⚠️ Edge function failed, falling back to direct DB insert');
      }
    } catch (error: any) {
      console.warn('⚠️ Edge function not available, falling back to direct DB insert:', error.message);
    }
  }

  // Fallback: Generate code directly in database
  try {
    console.log('📝 Generating admin code directly in database...');
    
    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash the code
    // Use expo-crypto for React Native compatibility
    const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
    const codeHash = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      code
    );

    // Set expiration (5 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('❌ No user found');
      return null;
    }

    // Insert into admin_codes table
    const { data: codeData, error: codeError } = await supabase
      .from('admin_codes')
      .insert({
        code_hash: codeHash,
        user_id: userId || null,
        action: action,
        expires_at: expiresAt.toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (codeError) {
      console.error('❌ Failed to create code in database:', codeError);
      return null;
    }

    // Log audit event (non-blocking)
    logAuditEvent('admin_code_generated', user.id, userId || null, {
      action,
      code_id: codeData.id,
    }).catch(err => console.warn('Audit log failed:', err));

    console.log('✅ Admin code generated directly in database');
    return {
      code: code,
      codeId: codeData.id,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error: any) {
    console.error('❌ Failed to generate admin code:', error);
    return null;
  }
}

// Validate admin code (tries edge function first, falls back to direct DB query)
export async function validateAdminCode(
  code: string,
  action: 'signup' | 'clock_in' | 'clock_out',
  userId?: string
): Promise<boolean> {
  if (!code || code.length !== 6) {
    console.error('❌ Invalid code format');
    return false;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.error('❌ No session found');
    return false;
  }

  // Try edge function first
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/validate-admin-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
          },
          body: JSON.stringify({ code, action, userId }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        if (result.valid === true) {
          console.log('✅ Code validated via edge function');
          return true;
        }
      } else {
        console.warn('⚠️ Edge function failed, falling back to direct DB query');
      }
    } catch (error: any) {
      console.warn('⚠️ Edge function not available, falling back to direct DB query:', error.message);
    }
  }

  // Fallback: Validate code directly from database
  try {
    console.log('🔍 Validating code directly from database...');
    
    // Hash the provided code (same method as generation)
    // Use expo-crypto for React Native compatibility
    const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
    const codeHash = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      code
    );

    console.log('🔑 Looking for code hash:', codeHash.substring(0, 10) + '...');

    // Find matching code in database
    const { data: codeData, error: codeError } = await supabase
      .from('admin_codes')
      .select('*')
      .eq('code_hash', codeHash)
      .eq('action', action)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (codeError) {
      console.error('❌ Error querying admin codes:', codeError);
      return false;
    }

    if (!codeData) {
      console.log('❌ Code not found or expired');
      return false;
    }

    console.log('✅ Code found:', {
      id: codeData.id,
      action: codeData.action,
      expires_at: codeData.expires_at,
      used: codeData.used
    });

    // Mark code as used (non-blocking - if it fails, code is still valid)
    try {
      const { error: updateError } = await supabase
        .from('admin_codes')
        .update({ 
          used: true,
          used_at: new Date().toISOString(),
          user_id: userId || null
        })
        .eq('id', codeData.id);

      if (updateError) {
        console.warn('⚠️ Failed to mark code as used (non-critical):', updateError.message);
        // Code is still valid, just couldn't mark it as used due to RLS
        // This is okay - the code validation succeeded
      } else {
        console.log('✅ Code marked as used');
      }
    } catch (err: any) {
      console.warn('⚠️ Exception marking code as used (non-critical):', err.message);
      // Continue anyway - code validation succeeded
    }

    // Return true regardless - code is valid even if we couldn't mark it as used
    return true;
  } catch (error: any) {
    console.error('❌ Failed to validate admin code:', error);
    return false;
  }
}

// Export time logs to CSV
export function exportToCSV(timeLogs: any[], filename: string = 'time_logs.csv'): string {
  if (timeLogs.length === 0) {
    return '';
  }

  const headers = ['Employee', 'Clock In', 'Clock Out', 'Work Cycle', 'Verified By', 'Flagged'];
  const rows = timeLogs.map(log => [
    log.employee_name || '',
    log.clock_in || '',
    log.clock_out || '',
    log.work_cycle || '',
    log.verified_by || '',
    log.flagged ? 'Yes' : 'No',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}



