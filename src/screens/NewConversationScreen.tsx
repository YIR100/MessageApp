import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, Profile } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, radius } from '../lib/theme';

export default function NewConversationScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [isGroup, setIsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Search users
  useEffect(() => {
    if (!search.trim()) {
      setUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${search}%`)
        .neq('id', user?.id)
        .limit(20);
      setUsers(data ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const toggleSelect = (profile: Profile) => {
    const alreadySelected = selected.some(s => s.id === profile.id);
    if (alreadySelected) {
      setSelected(prev => prev.filter(s => s.id !== profile.id));
      if (selected.length <= 2) setIsGroup(false);
    } else {
      const next = [...selected, profile];
      setSelected(next);
      if (next.length > 1) setIsGroup(true);
    }
  };

  const createConversation = async () => {
    if (!user || selected.length === 0) return;

    const isGroupChat = selected.length > 1 || isGroup;

    if (isGroupChat && !groupName.trim()) {
      Alert.alert('Group name required', 'Please enter a name for the group chat.');
      return;
    }

    setCreating(true);

    // For 1:1, check if conversation already exists
    if (!isGroupChat) {
      const otherId = selected[0].id;
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);

      const myIds = myConvs?.map(r => r.conversation_id) ?? [];

      if (myIds.length > 0) {
        const { data: shared } = await supabase
          .from('conversation_members')
          .select('conversation_id, conversations(*)')
          .eq('user_id', otherId)
          .in('conversation_id', myIds);

        const existing = shared?.find((r: any) => !r.conversations?.is_group);
        if (existing) {
          setCreating(false);
          navigation.replace('Chat', {
            conversation: {
              ...existing.conversations,
              other_user: selected[0],
            },
          });
          return;
        }
      }
    }

    // Create new conversation
    const { data: conv, error } = await supabase
      .from('conversations')
      .insert({
        name: isGroupChat ? groupName.trim() : null,
        is_group: isGroupChat,
        created_by: user.id,
      })
      .select()
      .single();

    if (error || !conv) {
      Alert.alert('Error', 'Could not create conversation.');
      setCreating(false);
      return;
    }

    // Add members (creator + selected)
    const memberIds = [user.id, ...selected.map(s => s.id)];
    await supabase.from('conversation_members').insert(
      memberIds.map(uid => ({ conversation_id: conv.id, user_id: uid }))
    );

    setCreating(false);
    navigation.replace('Chat', {
      conversation: {
        ...conv,
        other_user: selected[0],
        members: selected,
      },
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <TouchableOpacity
          style={[styles.createBtn, (selected.length === 0 || creating) && styles.createBtnDisabled]}
          onPress={createConversation}
          disabled={selected.length === 0 || creating}
        >
          {creating
            ? <ActivityIndicator size="small" color={colors.bg} />
            : <Text style={styles.createBtnText}>Start</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Selected chips */}
      {selected.length > 0 && (
        <View style={styles.chips}>
          {selected.map(s => (
            <TouchableOpacity key={s.id} style={styles.chip} onPress={() => toggleSelect(s)}>
              <Text style={styles.chipText}>{s.username}</Text>
              <Ionicons name="close-circle" size={14} color={colors.accent} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Group name input */}
      {(isGroup || selected.length > 1) && (
        <View style={styles.groupNameRow}>
          <TextInput
            style={styles.groupNameInput}
            placeholder="Group name…"
            placeholderTextColor={colors.textDim}
            value={groupName}
            onChangeText={setGroupName}
          />
        </View>
      )}

      {/* Group toggle (when 1 selected) */}
      {selected.length === 1 && (
        <View style={styles.groupToggle}>
          <Text style={styles.groupToggleLabel}>Make group chat</Text>
          <Switch
            value={isGroup}
            onValueChange={setIsGroup}
            trackColor={{ false: colors.border, true: colors.accentDim }}
            thumbColor={isGroup ? colors.accent : colors.textMuted}
          />
        </View>
      )}

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username…"
          placeholderTextColor={colors.textDim}
          value={search}
          onChangeText={setSearch}
          autoFocus
        />
        {loading && <ActivityIndicator size="small" color={colors.textMuted} />}
      </View>

      {/* User list */}
      <FlatList
        data={users}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const isSelected = selected.some(s => s.id === item.id);
          return (
            <TouchableOpacity style={styles.userRow} onPress={() => toggleSelect(item)}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>{item.username.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.userName}>{item.username}</Text>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={() =>
          search.trim() ? (
            <Text style={styles.emptyText}>No users found</Text>
          ) : (
            <Text style={styles.emptyText}>Search for people to message</Text>
          )
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  headerTitle: {
    flex: 1, fontSize: 17, fontWeight: '600',
    color: colors.text, fontFamily: 'Georgia',
  },
  createBtn: {
    backgroundColor: colors.accent, borderRadius: radius.full,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    minWidth: 56, alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: colors.bg, fontWeight: '700', fontSize: 14 },
  chips: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs,
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accentDim, borderRadius: radius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 4,
  },
  chipText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  groupNameRow: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  groupNameInput: {
    fontSize: 15, color: colors.text,
    paddingVertical: spacing.sm,
  },
  groupToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  groupToggleLabel: { fontSize: 15, color: colors.text },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.md,
  },
  userAvatar: {
    width: 44, height: 44, borderRadius: radius.full,
    backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center',
  },
  userAvatarText: { color: colors.accent, fontSize: 17, fontFamily: 'Georgia' },
  userName: { flex: 1, fontSize: 15, color: colors.text },
  emptyText: { color: colors.textMuted, textAlign: 'center', padding: 40, fontSize: 14 },
});
