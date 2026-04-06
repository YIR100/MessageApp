import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, radius } from '../lib/theme';

export default function ProfileScreen() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!username.trim() || !user) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: username.trim() })
      .eq('id', user.id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      await refreshProfile();
      Alert.alert('Saved', 'Your profile has been updated.');
    }
    setSaving(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Profile</Text>

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.username ?? 'U').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      {/* Edit username */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>USERNAME</Text>
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="your_username"
            placeholderTextColor={colors.textDim}
          />
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={colors.bg} size="small" />
            : <Text style={styles.saveBtnText}>Save changes</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Account info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.infoRow}>
          <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
          <Text style={styles.infoText}>{user?.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
          <Text style={styles.infoText}>
            Joined {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
          </Text>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={18} color={colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  headerTitle: {
    fontSize: 26, fontFamily: 'Georgia',
    color: colors.text, marginBottom: spacing.xl,
  },
  avatarSection: {
    alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl,
  },
  avatar: {
    width: 80, height: 80, borderRadius: radius.full,
    backgroundColor: colors.accentDim,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.accent,
  },
  avatarText: { fontSize: 32, color: colors.accent, fontFamily: 'Georgia' },
  email: { fontSize: 14, color: colors.textMuted },
  section: {
    marginBottom: spacing.xl,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 11, color: colors.textMuted,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4,
  },
  inputGroup: {
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, backgroundColor: colors.bgInput,
  },
  input: {
    padding: spacing.md, color: colors.text, fontSize: 15,
  },
  saveBtn: {
    backgroundColor: colors.accent, borderRadius: radius.sm,
    padding: spacing.sm, alignItems: 'center', marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: colors.bg, fontWeight: '700', fontSize: 14 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 4,
  },
  infoText: { fontSize: 14, color: colors.textMuted },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.bgCard, borderWidth: 1,
    borderColor: `${colors.danger}40`,
    marginTop: 'auto',
  },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
});
