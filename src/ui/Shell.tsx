import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabase } from '../lib/supabase';

export default function Shell() {
  const { session, profile, signOut } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!session || !supabase) return;
    
    // Request permissions for notifications
    if (Capacitor.isNativePlatform()) {
      LocalNotifications.requestPermissions();
    } else if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
      }
    }

    const sb = requireSupabase();
    
    const channel = sb.channel('global-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages'
      }, async (payload: any) => {
        const msg = payload.new;
        if (msg.sender_id === session.user.id) return; // Don't notify for our own messages
        
        // If we are currently on this chat page, don't show a notification
        if (location.pathname === `/chat/${msg.conversation_id}`) return;

        // Fetch sender profile to show name
        const { data: senderProfile } = await sb.from('profiles').select('username').eq('id', msg.sender_id).single();
        const title = senderProfile?.username || 'New Message';

        if (Capacitor.isNativePlatform()) {
          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body: msg.content || (msg.media_url ? 'Sent an attachment' : 'New message'),
                id: Math.floor(Math.random() * 1000000),
                extra: { conversation_id: msg.conversation_id }
              }
            ]
          });
        } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body: msg.content || (msg.media_url ? 'Sent an attachment' : 'New message') });
        }
      })
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [session, location.pathname]);

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

