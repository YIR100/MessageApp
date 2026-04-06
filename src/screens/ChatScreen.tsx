import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase, Message, Conversation } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { colors, spacing, radius } from '../lib/theme';

export default function ChatScreen() {
  const { user, profile } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const conversation: Conversation = route.params?.conversation;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<any>(null);

  const conversationTitle = conversation.is_group
    ? conversation.name
    : conversation.other_user?.username ?? 'Chat';

  // ── Load existing messages ───────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*, sender:profiles(*)')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });

      setMessages((data as Message[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  // ── Real-time subscription ───────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      // New messages
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversation.id}`,
      }, async (payload) => {
        // Fetch sender profile
        const { data: sender } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', payload.new.sender_id)
          .single();

        const msg = { ...payload.new, sender } as Message;
        setMessages(prev => {
          const exists = prev.some(m => m.id === msg.id);
          return exists ? prev : [...prev, msg];
        });
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      })
      // Typing indicators (broadcast)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === user?.id) return;
        setTypingUsers(prev =>
          prev.includes(payload.username) ? prev : [...prev, payload.username]
        );
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u !== payload.username));
        }, 2000);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, user?.id]);

  // ── Scroll to bottom on load ─────────────────────────────────────────
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [loading]);

  // ── Send message ─────────────────────────────────────────────────────
  const sendMessage = async () => {
    const content = input.trim();
    if (!content || !user) return;
    setInput('');
    setSending(true);

    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      content,
    });

    setSending(false);
  };

  // ── Typing indicator ─────────────────────────────────────────────────
  const handleTyping = (text: string) => {
    setInput(text);
    if (!profile) return;

    supabase.channel(`chat-${conversation.id}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user?.id, username: profile.username },
    });

    clearTimeout(typingTimeoutRef.current);
  };

  // ── Render message bubble ─────────────────────────────────────────────
  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isSelf = item.sender_id === user?.id;
    const prevMsg = messages[index - 1];
    const showSender = conversation.is_group && !isSelf &&
      (!prevMsg || prevMsg.sender_id !== item.sender_id);

    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit',
    });

    return (
      <View style={[styles.msgRow, isSelf && styles.msgRowSelf]}>
        {!isSelf && conversation.is_group && (
          <View style={styles.msgAvatar}>
            {showSender && (
              <View style={styles.smallAvatar}>
                <Text style={styles.smallAvatarText}>
                  {(item.sender?.username ?? '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        )}
        <View style={[styles.bubble, isSelf ? styles.bubbleSelf : styles.bubbleOther]}>
          {showSender && (
            <Text style={styles.senderName}>{item.sender?.username}</Text>
          )}
          <Text style={[styles.msgText, isSelf && styles.msgTextSelf]}>{item.content}</Text>
          <Text style={[styles.msgTime, isSelf && styles.msgTimeSelf]}>{time}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{conversationTitle}</Text>
          {conversation.is_group && (
            <Text style={styles.headerSub}>
              {conversation.members?.length ?? 0} members
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => navigation.navigate('ConversationInfo', { conversation })}
        >
          <Ionicons name="information-circle-outline" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.msgList}
          ListEmptyComponent={() => (
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>Say hello 👋</Text>
            </View>
          )}
        />
      )}

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <View style={styles.typingBar}>
          <Text style={styles.typingText}>
            {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor={colors.textDim}
          value={input}
          onChangeText={handleTyping}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={!input.trim() || sending}
        >
          {sending
            ? <ActivityIndicator color={colors.bg} size="small" />
            : <Ionicons name="arrow-up" size={18} color={colors.bg} />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    fontFamily: 'Georgia',
  },
  headerSub: {
    fontSize: 12,
    color: colors.textMuted,
  },
  infoBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  msgList: {
    padding: spacing.md,
    gap: spacing.sm,
    flexGrow: 1,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  msgRowSelf: {
    flexDirection: 'row-reverse',
  },
  msgAvatar: {
    width: 28,
    marginRight: spacing.xs,
    alignItems: 'center',
  },
  smallAvatar: {
    width: 28, height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
  smallAvatarText: {
    color: colors.accent, fontSize: 12, fontWeight: '600',
  },
  bubble: {
    maxWidth: '75%',
    padding: spacing.md,
    borderRadius: radius.lg,
    gap: 4,
  },
  bubbleOther: {
    backgroundColor: colors.bgCard,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleSelf: {
    backgroundColor: colors.accentDim,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: '#4D3A1A',
  },
  senderName: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: 2,
  },
  msgText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 21,
  },
  msgTextSelf: {
    color: '#F5DEB0',
  },
  msgTime: {
    fontSize: 10,
    color: colors.textDim,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  msgTimeSelf: {
    color: '#7A6040',
  },
  typingBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  typingText: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: {
    width: 38, height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  emptyChat: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 80,
  },
  emptyChatText: {
    color: colors.textMuted, fontSize: 15,
  },
});
