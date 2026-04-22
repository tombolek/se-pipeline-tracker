import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export default function Drawer({ open, onClose, children }: Props) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Portal to body so overflow:hidden ancestors don't clip the fixed drawer
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-brand-navy/20 dark:bg-black/50 backdrop-blur-[1px] z-20 transition-opacity duration-200 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[68%] min-w-[600px] bg-white dark:bg-ink-0 shadow-2xl dark:border-l dark:border-ink-border-soft z-30 flex flex-col transition-transform duration-250 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close button — top-left corner to avoid header button overlap */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 z-10 w-7 h-7 rounded-full bg-brand-navy-30/50 dark:bg-ink-2 hover:bg-brand-navy-30 dark:hover:bg-ink-3 flex items-center justify-center text-brand-navy-70 dark:text-fg-3 hover:text-brand-navy dark:hover:text-fg-1 transition-colors"
          aria-label="Close"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
