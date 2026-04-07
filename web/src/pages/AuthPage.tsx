import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { requireSupabase, supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export default function AuthPage() {
  const { session, refreshProfile } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password.trim()) return false;
    if (mode === 'register' && !username.trim()) return false;
    return true;
  }, [email, password, username, mode]);

  if (session) return <Navigate to="/conversations" replace />;

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const sb = requireSupabase();
      if (mode === 'login') {
        const { error: e } = await sb.auth.signInWithPassword({ email, password });
        if (e) throw e;
      } else {
        const { data, error: e } = await sb.auth.signUp({
          email,
          password,
          options: { data: { username: username.trim() } },
        });
        if (e) throw e;

        // If your DB trigger populates profiles, this will pick it up.
        if (data.session) await refreshProfile();
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 520, paddingTop: 48 }}>
      <div className="card col">
        <div className="col" style={{ gap: 6 }}>
          <div style={{ fontSize: 28, fontWeight: 850, letterSpacing: 0.2 }}>MessageApp</div>
          <div className="muted">
            {mode === 'login' ? 'Welcome back.' : 'Create your account.'}
          </div>
        </div>

        {mode === 'register' && (
          <div className="col" style={{ gap: 8 }}>
            <div className="dim" style={{ fontSize: 12, letterSpacing: 1 }}>USERNAME</div>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        )}

        <div className="col" style={{ gap: 8 }}>
          <div className="dim" style={{ fontSize: 12, letterSpacing: 1 }}>EMAIL</div>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="col" style={{ gap: 8 }}>
          <div className="dim" style={{ fontSize: 12, letterSpacing: 1 }}>PASSWORD</div>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="item" style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.12)' }}>
            <div style={{ color: '#fecaca', fontSize: 14 }}>{error}</div>
          </div>
        )}

        <div className="row">
          <button className="btn primary grow" disabled={!canSubmit || busy} onClick={submit}>
            {busy ? 'Working…' : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
          <button className="btn" disabled={busy} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </div>

        <div className="dim" style={{ fontSize: 13 }}>
          {supabase
            ? <>Supabase configured.</>
            : <>Configure Supabase in <code>web/.env</code> (see <code>web/.env.example</code>).</>
          }
        </div>
      </div>
    </div>
  );
}

