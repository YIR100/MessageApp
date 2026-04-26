import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import AuthPage from './pages/AuthPage.tsx';
import ConversationsPage from './pages/ConversationsPage.tsx';
import ChatPage from './pages/ChatPage.tsx';
import NewConversationPage from './pages/NewConversationPage.tsx';
import ProfilePage from './pages/ProfilePage.tsx';
import Shell from './ui/Shell.tsx';

export default function App() {
  const { loading, session } = useAuth();

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <Routes>
      <Route
        path="/"
        element={session ? <Navigate to="/conversations" replace /> : <Navigate to="/auth" replace />}
      />

      <Route path="/auth" element={<AuthPage />} />

      <Route
        element={<Shell />}
      >
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/new" element={<NewConversationPage />} />
        <Route path="/chat/:id" element={<ChatPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
