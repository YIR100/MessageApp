import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabase } from '../lib/supabase';
import type { Profile } from '../lib/supabase';

export default function NewConversationPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGroup = useMemo(() => selected.length > 1, [selected.length]);

  useEffect(() => {
    if (!q.trim() || !user) {
      setUsers([]);
      return;
    }
    if (!supabase) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await requireSupabase()
        .from('profiles')
        .select('*')
        .ilike('username', `%${q}%`)
        .neq('id', user.id)
        .limit(20);
      setUsers((data as Profile[]) ?? []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, user]);

  const toggle = (p: Profile) => {
    setSelected((prev) => (prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]));
  };

  const create = async () => {
    if (!user || selected.length === 0) return;
    if (!supabase) {
      setError('Supabase is not configured. Create web/.env first.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const sb = requireSupabase();
      const groupChat = isGroup;
      if (groupChat && !groupName.trim()) {
        setError('Group name is required for group chats.');
        return;
      }

      // 1:1: reuse existing conversation if one exists
      if (!groupChat) {
        const otherId = selected[0].id;
        const { data: myConvs } = await sb
          .from('conversation_members')
          .select('conversation_id')
          .eq('user_id', user.id);

        const myIds = (myConvs ?? []).map((r: any) => r.conversation_id);
        if (myIds.length) {
          const { data: shared } = await supabase
            .from('conversation_members')
            .select('conversation_id, conversations(*)')
            .eq('user_id', otherId)
            .in('conversation_id', myIds);

          const existing = (shared ?? []).find((r: any) => !r.conversations?.is_group);
          if (existing?.conversation_id) {
            nav(`/chat/${existing.conversation_id}`);
            return;
          }
        }
      }

      const { data: conv, error: e1 } = await sb
        .from('conversations')
        .insert({
          name: groupChat ? groupName.trim() : null,
          is_group: groupChat,
          created_by: user.id,
        })
        .select()
        .single();
      if (e1 || !conv) throw e1 ?? new Error('Failed to create conversation');

      const memberIds = [user.id, ...selected.map((s) => s.id)];
      const { error: e2 } = await sb.from('conversation_members').insert(
        memberIds.map((uid) => ({ conversation_id: (conv as any).id, user_id: uid }))
      );
      if (e2) throw e2;

      nav(`/chat/${(conv as any).id}`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create conversation');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="split">
      <div className="card col">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="col" style={{ gap: 2 }}>
            <div style={{ fontSize: 20, fontWeight: 850 }}>New conversation</div>
            <div className="muted" style={{ fontSize: 13 }}>Search users by username.</div>
          </div>
          <button className="btn primary" disabled={selected.length === 0 || creating} onClick={create}>
            {creating ? 'Creating…' : 'Start'}
          </button>
        </div>

        <div className="col" style={{ gap: 8 }}>
          <div className="dim" style={{ fontSize: 12, letterSpacing: 1 }}>SEARCH</div>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="username…" />
          {loading && <div className="dim" style={{ fontSize: 13 }}>Searching…</div>}
        </div>

        {error && (
          <div className="item" style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)' }}>
            <div style={{ color: '#fecaca', fontSize: 14 }}>{error}</div>
          </div>
        )}

        <div className="list">
          {users.map((u) => {
            const picked = selected.some((s) => s.id === u.id);
            return (
              <button
                key={u.id}
                className="item"
                style={{ textAlign: 'left', cursor: 'pointer', background: picked ? 'rgba(139,92,246,0.18)' : undefined }}
                onClick={() => toggle(u)}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row">
                    <div style={{
                      width: 34, height: 34, borderRadius: 999,
                      display: 'grid', placeItems: 'center',
                      border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)',
                      fontWeight: 800,
                    }}>
                      {u.username?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <div className="col" style={{ gap: 2 }}>
                      <div style={{ fontWeight: 750 }}>@{u.username}</div>
                      <div className="dim" style={{ fontSize: 12 }}>{u.id}</div>
                    </div>
                  </div>
                  <div className="dim" style={{ fontSize: 13 }}>{picked ? 'Selected' : 'Tap'}</div>
                </div>
              </button>
            );
          })}
          {q.trim() && !loading && users.length === 0 && (
            <div className="muted">No users found.</div>
          )}
        </div>
      </div>

      <div className="card col">
        <div className="col" style={{ gap: 2 }}>
          <div style={{ fontSize: 18, fontWeight: 850 }}>Selected</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {selected.length === 0 ? 'Pick at least one user.' : `${selected.length} user(s) selected.`}
          </div>
        </div>

        {isGroup && (
          <div className="col" style={{ gap: 8 }}>
            <div className="dim" style={{ fontSize: 12, letterSpacing: 1 }}>GROUP NAME</div>
            <input className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name…" />
          </div>
        )}

        <div className="list">
          {selected.map((u) => (
            <div key={u.id} className="item">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 750 }}>@{u.username}</div>
                <button className="btn" onClick={() => toggle(u)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

