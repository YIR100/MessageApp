import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { requireSupabase, supabase } from '../lib/supabase';
import type { Conversation, Message, Profile } from '../lib/supabase';
import { uploadAttachment } from '../lib/storage';
import Modal from '../ui/Modal';
import { Camera, CameraResultType } from '@capacitor/camera';
import { Camera as CameraIcon, Image as ImageIcon, Reply, Trash, Edit, Check, X } from 'lucide-react';

export default function ChatPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null);
  
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ msgId: string, x: number, y: number } | null>(null);
  const [msgToDelete, setMsgToDelete] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const previewObjectUrlRef = useRef<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const title = useMemo(() => {
    if (!conversation) return 'Chat';
    return conversation.is_group ? (conversation.name ?? 'Group Chat') : (conversation.other_user?.username ?? 'Chat');
  }, [conversation]);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  const revokePreviewObjectUrl = () => {
    if (previewObjectUrlRef.current) {
      URL.revokeObjectURL(previewObjectUrlRef.current);
      previewObjectUrlRef.current = null;
    }
  };

  const clearPressTimer = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const markMessagesAsRead = async (messageIds: string[]) => {
    if (!user || messageIds.length === 0) return;
    await requireSupabase()
      .from('message_reads')
      .upsert(
        messageIds.map((message_id) => ({ message_id, user_id: user.id })),
        { onConflict: 'message_id,user_id', ignoreDuplicates: true }
      );
  };

  const scrollToMessage = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.backgroundColor = 'rgba(139,92,246,0.3)';
      setTimeout(() => {
        el.style.backgroundColor = '';
      }, 1000);
    }
  };

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
        await markMessagesAsRead(unreadIds);
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

          if (msg.sender_id !== user.id) {
            await markMessagesAsRead([msg.id]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user]);

  useEffect(() => {
    // Click outside context menu to close it
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      revokePreviewObjectUrl();
      clearPressTimer();
    };
  }, []);

  const send = async () => {
    const content = input.trim();
    if ((!content && !selectedFile && !previewUrl) || !user || !id) return;
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
      } else if (previewUrl && previewUrl.startsWith('data:')) {
        // Handle base64 from camera (convert to file)
        const res = await fetch(previewUrl);
        const blob = await res.blob();
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
        media_url = await uploadAttachment(file);
      }
      
      setSelectedFile(null);
      revokePreviewObjectUrl();
      setPreviewUrl(null);

      const { error } = await requireSupabase().from('messages').insert({
        conversation_id: id,
        sender_id: user.id,
        content,
        media_url,
        reply_to_id: replyingToMessageId
      });
      if (error) throw error;
      setReplyingToMessageId(null);
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      revokePreviewObjectUrl();
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrlRef.current = objectUrl;
      setPreviewUrl(objectUrl);
    }
  };

  const takePicture = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl
      });
      if (image.dataUrl) {
        setSelectedFile(null);
        revokePreviewObjectUrl();
        setPreviewUrl(image.dataUrl);
      }
    } catch (e) {
      console.log('Camera cancelled or failed:', e);
    }
  };

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent, msgId: string) => {
    if (isMultiSelect) return;
    clearPressTimer();
    const isMouse = e.type === 'mousedown';
    const clientX = isMouse ? (e as React.MouseEvent).clientX : (e as React.TouchEvent).touches[0].clientX;
    const clientY = isMouse ? (e as React.MouseEvent).clientY : (e as React.TouchEvent).touches[0].clientY;
    
    pressTimerRef.current = window.setTimeout(() => {
      setContextMenu({ msgId, x: clientX, y: clientY });
      pressTimerRef.current = null;
    }, 500);
  };

  const handleTouchEnd = () => {
    clearPressTimer();
  };

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault(); // Prevent standard browser right-click menu
    if (isMultiSelect) return;
    setContextMenu({ msgId, x: e.clientX, y: e.clientY });
  };

  const toggleSelect = (msgId: string) => {
    setSelectedMessages(prev => 
      prev.includes(msgId) ? prev.filter(id => id !== msgId) : [...prev, msgId]
    );
  };

  const deleteSelected = async () => {
    const ownMessageIds = messages
      .filter((m) => m.sender_id === user?.id && selectedMessages.includes(m.id) && !m.is_deleted)
      .map((m) => m.id);
    if (ownMessageIds.length === 0) return;
    if (!confirm(`Delete ${ownMessageIds.length} messages?`)) return;
    
    await requireSupabase()
      .from('messages')
      .update({ is_deleted: true, content: '' })
      .in('id', ownMessageIds);
      
    setIsMultiSelect(false);
    setSelectedMessages([]);
  };

  const confirmDelete = async () => {
    if (!msgToDelete) return;
    await requireSupabase()
      .from('messages')
      .update({ is_deleted: true, content: '' })
      .eq('id', msgToDelete);
    setMsgToDelete(null);
  };

  if (!id) return <div className="card">Missing conversation id.</div>;

  const replyingToMsg = replyingToMessageId ? messages.find(m => m.id === replyingToMessageId) : null;

  return (
    <div className="col" style={{ gap: 14, position: 'relative' }}>
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
          <div className="chatBox" ref={chatBoxRef}>
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
                const isSelected = selectedMessages.includes(m.id);
                const quotedMsg = m.reply_to_id ? messages.find(qm => qm.id === m.reply_to_id) : null;

                return (
                  <div key={m.id} className="row" style={{ alignItems: 'flex-end', justifyContent: isSelf ? 'flex-end' : 'flex-start' }}>
                    {isMultiSelect && (
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleSelect(m.id)}
                        style={{ width: 20, height: 20, accentColor: 'var(--accent)', cursor: 'pointer', marginBottom: 16 }}
                      />
                    )}
                    <div 
                      id={`msg-${m.id}`}
                      className={`bubble ${isSelf ? 'self' : ''} ${isSelected ? 'selected' : ''}`}
                      onMouseDown={(e) => handleTouchStart(e, m.id)}
                      onMouseUp={handleTouchEnd}
                      onMouseLeave={handleTouchEnd}
                      onTouchStart={(e) => handleTouchStart(e, m.id)}
                      onTouchEnd={handleTouchEnd}
                      onContextMenu={(e) => handleContextMenu(e, m.id)}
                      onClick={() => {
                        if (isMultiSelect) toggleSelect(m.id);
                      }}
                      style={{ cursor: isMultiSelect ? 'pointer' : 'default' }}
                    >
                      {conversation?.is_group && !isSelf && (
                        <div style={{ fontWeight: 750, fontSize: 13, marginBottom: 6 }}>
                          {m.sender?.username ?? '—'}
                        </div>
                      )}
                      
                      {m.is_deleted ? (
                        <div className="muted" style={{ fontStyle: 'italic' }}>This message was deleted</div>
                      ) : (
                        <>
                          {quotedMsg && (
                            <div className="quote" onClick={(e) => { e.stopPropagation(); scrollToMessage(quotedMsg.id); }}>
                              <div className="quote-sender">{quotedMsg.sender?.username}</div>
                              {quotedMsg.is_deleted ? <span className="muted">Deleted</span> : quotedMsg.content || 'Media'}
                            </div>
                          )}
                          
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
                      </div>
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
        {/* Reply Preview */}
        {replyingToMsg && (
          <div className="row" style={{ padding: '8px 12px', background: 'rgba(139,92,246,0.1)', borderLeft: '3px solid var(--accent)', borderRadius: '4px 8px 8px 4px', justifyContent: 'space-between' }}>
            <div className="col" style={{ gap: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>Replying to {replyingToMsg.sender?.username}</div>
              <div style={{ fontSize: 14 }} className="muted">{replyingToMsg.content || 'Media attachment'}</div>
            </div>
            <button className="btn" style={{ padding: '4px 8px' }} onClick={() => setReplyingToMessageId(null)}><X size={16}/></button>
          </div>
        )}

        {/* Edit Preview */}
        {editingMessageId && (
          <div className="row" style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.05)', borderRadius: 8, justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14 }}>✏️ Editing message</span>
            <button className="btn" style={{ padding: '4px 8px' }} onClick={() => { setEditingMessageId(null); setInput(''); }}><X size={16}/></button>
          </div>
        )}

        {/* Media Preview */}
        {previewUrl && (
          <div className="preview-box">
            <img src={previewUrl} alt="preview" className="preview-img" />
            <div className="col grow" style={{ gap: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Media Attached</span>
              <span style={{ fontSize: 12 }} className="muted">{selectedFile ? selectedFile.name : 'Camera Photo'}</span>
            </div>
            <button className="btn" style={{ padding: '4px 8px' }} onClick={() => { setSelectedFile(null); revokePreviewObjectUrl(); setPreviewUrl(null); }}><X size={16}/></button>
          </div>
        )}

        {/* Input Bar */}
        <div className="row">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileChange}
            accept="image/*,video/*"
          />
          <button className="btn" onClick={() => fileInputRef.current?.click()} style={{ padding: '10px', borderRadius: '50%' }}>
            <ImageIcon size={20} />
          </button>
          <button className="btn" onClick={takePicture} style={{ padding: '10px', borderRadius: '50%' }}>
            <CameraIcon size={20} />
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
          <button className="btn primary" onClick={send} disabled={(!input.trim() && !previewUrl) || sending} style={{ marginLeft: 4, padding: '10px 20px', borderRadius: 999 }}>
            {sending ? '...' : (editingMessageId ? <Check size={20} /> : 'Send')}
          </button>
        </div>
      </div>

      {/* Context Menu (Long Press) */}
      {contextMenu && (
        <div 
          className="context-menu" 
          style={{ 
            top: Math.min(contextMenu.y, window.innerHeight - 200), 
            left: Math.min(contextMenu.x, window.innerWidth - 160) 
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const m = messages.find(msg => msg.id === contextMenu.msgId);
            if (!m) return null;
            const isSelf = m.sender_id === user?.id;

            return (
              <>
                <div className="context-menu-item" onClick={() => { setReplyingToMessageId(m.id); setContextMenu(null); }}>
                  <Reply size={16} /> Reply
                </div>
                {!m.is_deleted && isSelf && !m.media_url && (
                  <div className="context-menu-item" onClick={() => { setEditingMessageId(m.id); setInput(m.content); setContextMenu(null); }}>
                    <Edit size={16} /> Edit
                  </div>
                )}
                <div className="context-menu-item" onClick={() => { setIsMultiSelect(true); setSelectedMessages([m.id]); setContextMenu(null); }}>
                  <Check size={16} /> Select
                </div>
                {isSelf && !m.is_deleted && (
                  <div className="context-menu-item danger" onClick={() => { setMsgToDelete(m.id); setContextMenu(null); }}>
                    <Trash size={16} /> Delete
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Multi-select Floating Action Bar */}
      {isMultiSelect && (
        <div className="floating-action-bar">
          <div style={{ fontWeight: 600 }}>{selectedMessages.length} selected</div>
          <button className="btn danger" onClick={deleteSelected} disabled={selectedMessages.length === 0} style={{ padding: '6px 12px', borderRadius: 999 }}>
            <Trash size={16} style={{ marginRight: 6 }}/> Delete
          </button>
          <button className="btn" onClick={() => { setIsMultiSelect(false); setSelectedMessages([]); }} style={{ padding: '6px 12px', borderRadius: 999 }}>
            Cancel
          </button>
        </div>
      )}

      {/* Delete Single Modal */}
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
