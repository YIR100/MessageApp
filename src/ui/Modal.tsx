import React from 'react';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content col" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{title}</div>
          <button className="btn" style={{ padding: '6px 10px', borderRadius: 999 }} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
