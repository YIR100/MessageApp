import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Shell() {
  const { session, profile, signOut } = useAuth();
  const location = useLocation();

  if (!session) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  return (
    <>
      <div className="topbar">
        <div className="container nav">
          <div className="row" style={{ gap: 14 }}>
            <div className="brand">MessageApp</div>
            <div className="dim" style={{ fontSize: 13 }}>
              {profile?.username ? `@${profile.username}` : session.user.email}
            </div>
          </div>
          <div className="navlinks">
            <Link className="btn" to="/conversations">Conversations</Link>
            <Link className="btn" to="/new">New</Link>
            <Link className="btn" to="/profile">Profile</Link>
            <button className="btn danger" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 18 }}>
        <Outlet />
      </div>
    </>
  );
}

