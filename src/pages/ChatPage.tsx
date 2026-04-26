import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabase } from '../lib/supabase';
import type { Conversation, Message, Profile } from '../lib/supabase';
import { uploadAttachment } from '../lib/storage';
import Modal from '../ui/Modal';

export default function ChatPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [msgToDelete, setMsgToDelete] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const title = useMemo(() => {
    if (!conversation) return 'Chat';
    return conversation.is_group ? (conversation.name ?? 'Group Chat') : (conversation.other_user?.username ?? 'Chat');
  }, [conversation]);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => {
    if (!id || !user) return;
    if (!supabase) {
      setLoading(false);
      return;
    }
    const sb = requireSupabase();
    let mounted = true;

    const load = async () => {
      setLoading(true);

      const { data: conv } = await sb
        .from('conversations')
        .select('*')
        .eq('id', id)
        .single();

      const { data: members } = await sb
        .from('conversation_members')
        .select('user_id, profiles(*)')
        .eq('conversation_id', id);

      const profiles = (members ?? [])
        .map((m: any) => m.profiles)
        .filter(Boolean) as Profile[];
      const other = profiles.find((p) => p.id !== user.id);

      const { data: msgs, error: msgsError } = await sb
        .from('messages')
        .select('*, sender:profiles(*), message_reads(user_id, read_at)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (msgsError) {
        console.error('Error fetching messages:', msgsError);
      }

      if (!mounted) return;
      setConversation({ ...(conv as any), members: profiles, other_user: other } as Conversation);
      setMessages((msgs as any as Message[]) ?? []);
      setLoading(false);
      setTimeout(scrollToBottom, 50);

      // Mark unread messages as read
      const unreadIds = (msgs as any[] ?? [])
        .filter(m => m.sender_id !== user.id && !m.message_reads?.some((r: any) => r.user_id === user.id))
        .map(m => m.id);

      if (unreadIds.length > 0) {
        await sb.from('message_reads').insert(
          unreadIds.map(msgId => ({ message_id: msgId, user_id: user.id }))
        );
      }
    };

    load();

    const channel = sb
      .channel(`chat-web-${id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, async (payload) => {
        if (payload.eventType === 'INSERT') {
          const { data: sender } = await sb
            .from('profiles')
            .select('*')
            .eq('id', (payload.new as any).sender_id)
            .single();
          const msg = { ...(payload.new as any), sender, message_reads: [] } as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          setTimeout(scrollToBottom, 50);

          // If someone else sent a message while we are in the chat, mark it as read
          if (msg.sender_id !== user.id) {
            await sb.from('message_reads').insert({ message_id: msg.id, user_id: user.id });
          }
        } else if (payload.eventType === 'UPDATE') {
          setMessages((prev) => prev.map((m) => m.id === payload.new.id ? { ...m, ...payload.new } : m));
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'message_reads'
      }, (payload) => {
        setMessages((prev) => prev.map((m) => {
          if (m.id === payload.new.message_id) {
            return { ...m, message_reads: [...(m.message_reads || []), payload.new as any] };
          }
          return m;
        }));
      })
      .subscribe();

    return () => {
      mounted = false;
      sb.removeChannel(channel);
    };
  }, [id, user]);

  const send = async () => {
    const content = input.trim();
    if ((!content && !selectedFile) || !user || !id) return;
    if (!supabase) return;
    
    if (editingMessageId) {
      setSending(true);
      try {
        const { error } = await requireSupabase()
          .from('messages')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', editingMessageId);
        if (error) throw error;
        setEditingMessageId(null);
        setInput('');
      } finally {
        setSending(false);
      }
      return;
    }

    setInput('');
    setSending(true);
    try {
      let media_url = null;
      if (selectedFile) {
        media_url = await uploadAttachment(selectedFile);
        setSelectedFile(null);
      }

      const { error } = await requireSupabase().from('messages').insert({
        conversation_id: id,
        sender_id: user.id,
        content,
        media_url,
      });
      if (error) throw error;
    } finally {
      setSending(false);
    }
  };

  const startEditing = (m: Message) => {
    if (m.is_deleted || m.media_url) return; // simplify: don't edit deleted or media messages for now
    setEditingMessageId(m.id);
    setInput(m.content);
  };

  const confirmDelete = async () => {
    if (!msgToDelete) return;
    await requireSupabase()
      .from('messages')
      .update({ is_deleted: true, content: '' })
      .eq('id', msgToDelete);
    setMsgToDelete(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  if (!id) return <div className="card">Missing conversation id.</div>;

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="col" style={{ gap: 2 }}>
          <div style={{ fontSize: 22, fontWeight: 850 }}>{title}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {conversation?.is_group ? `${conversation.members?.length ?? 0} member(s)` : '1:1'}
          </div>
        </div>
        <Link className="btn" to="/conversations">Back</Link>
      </div>

      <div className="card">
        {!supabase ? (
          <div className="muted">Supabase is not configured. Create <code>web/.env</code> first.</div>
        ) : loading ? (
          <div className="muted">Loading messages…</div>
        ) : (
          <div className="chatBox">
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">👋</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>No messages yet</div>
                <div style={{ fontSize: 15, maxWidth: 280 }}>
                  Be the first to say hello and start the conversation!
                </div>
              </div>
            ) : (
              messages.map((m) => {
                const isSelf = m.sender_id === user?.id;
                const time = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={m.id} className={`bubble ${isSelf ? 'self' : ''}`}>
                    {conversation?.is_group && !isSelf && (
                      <div style={{ fontWeight: 750, fontSize: 13, marginBottom: 6 }}>
                        {m.sender?.username ?? '—'}
                      </div>
                    )}
                    {m.is_deleted ? (
                      <div className="muted" style={{ fontStyle: 'italic' }}>This message was deleted</div>
                    ) : (
                      <>
                        {m.media_url && (
                          <img src={m.media_url} alt="attachment" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 8, display: 'block' }} />
                        )}
                        {m.content && <div>{m.content}</div>}
                      </>
                    )}
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <div className="meta">
                        {time}{m.updated_at ? ' (edited)' : ''}
                        {isSelf && !m.is_deleted && (
                          <span style={{ marginLeft: 6, opacity: 0.8, color: m.message_reads?.length ? '#0a84ff' : 'inherit' }}>
                            {m.message_reads?.length ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                      {isSelf && !m.is_deleted && (
                        <div className="row" style={{ gap: 8 }}>
                          {!m.media_url && (
                            <button className="btn" style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', color: 'inherit', opacity: 0.7 }} onClick={() => startEditing(m)}>Edit</button>
                          )}
                          <button className="btn" style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', color: 'inherit', opacity: 0.7 }} onClick={() => setMsgToDelete(m.id)}>Del</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="col" style={{ gap: 8 }}>
        {selectedFile && (
          <div className="row" style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 8, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14 }}>📎 {selectedFile.name}</span>
            <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setSelectedFile(null)}>✕</button>
          </div>
        )}
        {editingMessageId && (
          <div className="row" style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 8, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14 }}>✏️ Editing message</span>
            <button className="btn" style={{ padding: '4px 8px' }} onClick={() => { setEditingMessageId(null); setInput(''); }}>Cancel</button>
          </div>
        )}
        <div className="row">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept="image/*,video/*"
          />
          <button className="btn" onClick={() => fileInputRef.current?.click()} style={{ marginRight: 8, padding: '0 16px' }}>
            📎
          </button>
          <input
            className="input grow"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn primary" onClick={send} disabled={(!input.trim() && !selectedFile) || sending} style={{ marginLeft: 8, padding: '0 20px', borderRadius: 999 }}>
            {sending ? '...' : (editingMessageId ? 'Save' : 'Send')}
          </button>
        </div>
      </div>

      <Modal isOpen={!!msgToDelete} onClose={() => setMsgToDelete(null)} title="Delete Message">
        <div className="muted" style={{ marginBottom: 24, fontSize: 15 }}>
          Are you sure you want to delete this message? This action cannot be undone.
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setMsgToDelete(null)}>Cancel</button>
          <button className="btn danger" onClick={confirmDelete}>Delete</button>
        </div>
      </Modal>
    </div>
  );
}

