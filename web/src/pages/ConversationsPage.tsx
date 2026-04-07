import { formatDistanceToNow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabase } from '../lib/supabase';
import type { Conversation, Profile } from '../lib/supabase';

export default function ConversationsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Conversation[]>([]);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => 'Conversations', []);

  const fetchConversations = async () => {
    if (!user) return;
    if (!supabase) {
      setError('Supabase is not configured. Create web/.env first.');
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const sb = requireSupabase();
      const { data: memberRows, error: e1 } = await sb
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', user.id);
      if (e1) throw e1;

      const ids = (memberRows ?? []).map((r: any) => r.conversation_id);
      if (!ids.length) {
        setItems([]);
        return;
      }

      const { data: convs, error: e2 } = await sb
        .from('conversations')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });
      if (e2) throw e2;

      const enriched = await Promise.all((convs ?? []).map(async (conv: any) => {
        const { data: members } = await sb
          .from('conversation_members')
          .select('user_id, profiles(*)')
          .eq('conversation_id', conv.id);

        const profiles = (members ?? [])
          .map((m: any) => m.profiles)
          .filter(Boolean) as Profile[];

        const { data: msgs } = await sb
          .from('messages')
          .select('content, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1);

        const otherUser = profiles.find((p) => p.id !== user.id);

        return {
          ...conv,
          members: profiles,
          other_user: otherUser,
          last_message: msgs?.[0]?.content,
          last_message_at: msgs?.[0]?.created_at,
        } as Conversation;
      }));

      enriched.sort((a, b) => {
        const aTime = a.last_message_at ?? a.created_at;
        const bTime = b.last_message_at ?? b.created_at;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

      setItems(enriched);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!supabase) return;
    const channel = requireSupabase()
      .channel('conversations-list-web')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetchConversations();
      })
      .subscribe();
    return () => {
      requireSupabase().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const getName = (c: Conversation) => {
    if (c.is_group) return c.name ?? 'Group Chat';
    return c.other_user?.username ?? 'Unknown';
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="col" style={{ gap: 2 }}>
          <div style={{ fontSize: 24, fontWeight: 850 }}>{title}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {loading ? 'Loading…' : `${items.length} conversation(s)`}
          </div>
        </div>
        <div className="row">
          <Link className="btn primary" to="/new">New message</Link>
          <button className="btn" onClick={fetchConversations} disabled={loading}>Refresh</button>
        </div>
      </div>

      {error && (
        <div className="item" style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)' }}>
          <div style={{ color: '#fecaca', fontSize: 14 }}>{error}</div>
        </div>
      )}

      {(!loading && items.length === 0) ? (
        <div className="card col" style={{ alignItems: 'center', textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 750 }}>No conversations yet</div>
          <div className="muted">Start one with “New message”.</div>
        </div>
      ) : (
        <div className="list">
          {items.map((c) => {
            const when = c.last_message_at ?? c.created_at;
            return (
              <Link key={c.id} className="item" to={`/chat/${c.id}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="col" style={{ gap: 4 }}>
                    <div style={{ fontWeight: 750 }}>{getName(c)}</div>
                    <div className="muted" style={{ fontSize: 13 }}>
                      {c.last_message ?? 'No messages yet'}
                    </div>
                  </div>
                  <div className="dim" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {when ? formatDistanceToNow(new Date(when), { addSuffix: false }) : ''}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

