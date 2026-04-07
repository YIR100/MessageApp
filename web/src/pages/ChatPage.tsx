import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabase } from '../lib/supabase';
import type { Conversation, Message, Profile } from '../lib/supabase';

export default function ChatPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

      const { data: msgs } = await sb
        .from('messages')
        .select('*, sender:profiles(*)')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (!mounted) return;
      setConversation({ ...(conv as any), members: profiles, other_user: other } as Conversation);
      setMessages((msgs as any as Message[]) ?? []);
      setLoading(false);
      setTimeout(scrollToBottom, 50);
    };

    load();

    const channel = sb
      .channel(`chat-web-${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${id}`,
      }, async (payload) => {
        const { data: sender } = await sb
          .from('profiles')
          .select('*')
          .eq('id', (payload.new as any).sender_id)
          .single();
        const msg = { ...(payload.new as any), sender } as Message;
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        setTimeout(scrollToBottom, 50);
      })
      .subscribe();

    return () => {
      mounted = false;
      sb.removeChannel(channel);
    };
  }, [id, user]);

  const send = async () => {
    const content = input.trim();
    if (!content || !user || !id) return;
    if (!supabase) return;
    setInput('');
    setSending(true);
    try {
      const { error } = await requireSupabase().from('messages').insert({
        conversation_id: id,
        sender_id: user.id,
        content,
      });
      if (error) throw error;
    } finally {
      setSending(false);
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
              <div className="muted">Say hello.</div>
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
                    <div>{m.content}</div>
                    <div className="meta">{time}</div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="row">
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
        <button className="btn primary" onClick={send} disabled={!input.trim() || sending}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

