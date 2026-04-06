import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { supabase, Conversation, Profile } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, radius } from '../lib/theme';

export default function ConversationsScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = async () => {
    if (!user) return;

    // Get all conversations the user is a member of
    const { data: memberRows } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (!memberRows?.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const conversationIds = memberRows.map(r => r.conversation_id);

    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('created_at', { ascending: false });

    if (!convs) return;

    // For each conversation, get members and last message
    const enriched = await Promise.all(convs.map(async (conv) => {
      // Get members with their profiles
      const { data: members } = await supabase
        .from('conversation_members')
        .select('user_id, profiles(*)')
        .eq('conversation_id', conv.id);

      const profiles = members?.map((m: any) => m.profiles).filter(Boolean) as Profile[];

      // Get last message
      const { data: msgs } = await supabase
        .from('messages')
        .select('content, created_at')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const otherUser = profiles.find(p => p.id !== user.id);

      return {
        ...conv,
        members: profiles,
        other_user: otherUser,
        last_message: msgs?.[0]?.content,
        last_message_at: msgs?.[0]?.created_at,
      } as Conversation;
    }));

    // Sort by last message time
    enriched.sort((a, b) => {
      const aTime = a.last_message_at ?? a.created_at;
      const bTime = b.last_message_at ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setConversations(enriched);
    setLoading(false);
    setRefreshing(false);
  };

  useFocusEffect(useCallback(() => {
    fetchConversations();
  }, [user]));

  useEffect(() => {
    // Subscribe to new messages to update conversation list in real time
    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const getConversationName = (conv: Conversation) => {
    if (conv.is_group) return conv.name ?? 'Group Chat';
    return conv.other_user?.username ?? 'Unknown';
  };

  const getAvatar = (conv: Conversation) => {
    const name = getConversationName(conv);
    return name.charAt(0).toUpperCase();
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => navigation.navigate('Chat', { conversation: item })}
    >
      <View style={[styles.avatar, item.is_group && styles.avatarGroup]}>
        {item.is_group
          ? <Ionicons name="people" size={20} color={colors.accent} />
          : <Text style={styles.avatarText}>{getAvatar(item)}</Text>
        }
      </View>

      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>{getConversationName(item)}</Text>
          {item.last_message_at && (
            <Text style={styles.time}>
              {formatDistanceToNow(new Date(item.last_message_at), { addSuffix: false })}
            </Text>
          )}
        </View>
        <Text style={styles.preview} numberOfLines={1}>
          {item.last_message ?? 'No messages yet'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('NewConversation')}
        >
          <Ionicons name="create-outline" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>✦</Text>
          <Text style={styles.emptyTitle}>No conversations yet</Text>
          <Text style={styles.emptySubtitle}>Tap the compose icon to start one</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchConversations(); }}
              tintColor={colors.accent}
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Georgia',
    color: colors.text,
    letterSpacing: 0.3,
  },
  newBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGroup: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    color: colors.accent,
    fontSize: 18,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  rowContent: {
    flex: 1,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  time: {
    fontSize: 11,
    color: colors.textDim,
    marginLeft: spacing.sm,
  },
  preview: {
    fontSize: 13,
    color: colors.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 80,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyIcon: {
    fontSize: 32,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontSize: 17,
    color: colors.text,
    fontFamily: 'Georgia',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
