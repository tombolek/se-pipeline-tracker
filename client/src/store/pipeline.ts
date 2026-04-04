import { create } from 'zustand';

interface PipelineState {
  closedLostUnread: number;
  setClosedLostUnread: (n: number) => void;
  inboxCount: number;
  setInboxCount: (n: number) => void;
  quickCaptureOpen: boolean;
  openQuickCapture: () => void;
  closeQuickCapture: () => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  closedLostUnread: 0,
  setClosedLostUnread: (n) => set({ closedLostUnread: n }),
  inboxCount: 0,
  setInboxCount: (n) => set({ inboxCount: n }),
  quickCaptureOpen: false,
  openQuickCapture: () => set({ quickCaptureOpen: true }),
  closeQuickCapture: () => set({ quickCaptureOpen: false }),
}));
