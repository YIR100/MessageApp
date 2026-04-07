import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabase } from '../lib/supabase';

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const [username, setUsername] = useState(profile?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setUsername(profile?.username ?? '');
  }, [profile?.username]);

  const save = async () => {
    if (!user || !username.trim()) return;
    if (!supabase) {
      setErr('Supabase is not configured. Create web/.env first.');
      return;
    }
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      const { error } = await requireSupabase()
        .from('profiles')
        .update({ username: username.trim() })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      setMsg('Saved.');
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="col" style={{ gap: 14, maxWidth: 640 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="col" style={{ gap: 2 }}>
          <div style={{ fontSize: 24, fontWeight: 850 }}>Profile</div>
          <div className="muted" style={{ fontSize: 13 }}>{user?.email}</div>
        </div>
      </div>

      <div className="card col">
        <div className="col" style={{ gap: 8 }}>
          <div className="dim" style={{ fontSize: 12, letterSpacing: 1 }}>USERNAME</div>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn primary" onClick={save} disabled={saving || !username.trim()}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          {msg && <div className="muted">{msg}</div>}
          {err && <div style={{ color: '#fecaca' }}>{err}</div>}
        </div>
      </div>

      <div className="card col">
        <div className="dim" style={{ fontSize: 12, letterSpacing: 1 }}>ACCOUNT</div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="muted">User ID</div>
          <div style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>{user?.id}</div>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="muted">Created</div>
          <div style={{ fontSize: 13 }}>
            {user?.created_at ? new Date(user.created_at).toLocaleString() : '—'}
          </div>
        </div>
      </div>
    </div>
  );
}

