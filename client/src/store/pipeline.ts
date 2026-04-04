import { create } from 'zustand';

interface PipelineState {
  closedLostUnread: number;
  setClosedLostUnread: (n: number) => void;
  inboxCount: number;
  setInboxCount: (n: number) => void;
  quickCaptureOpen: boolean;
  openQuickCapture: () => void;
  closeQuickCapture: () => void;
  // Team scope: null = Full View; number = show only SEs whose manager_id matches
  teamScopeManagerId: number | null;
  teamScopeInitialized: boolean;
  setTeamScopeManagerId: (id: number | null) => void;
  initTeamScope: (managerId: number) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  closedLostUnread: 0,
  setClosedLostUnread: (n) => set({ closedLostUnread: n }),
  inboxCount: 0,
  setInboxCount: (n) => set({ inboxCount: n }),
  quickCaptureOpen: false,
  openQuickCapture: () => set({ quickCaptureOpen: true }),
  closeQuickCapture: () => set({ quickCaptureOpen: false }),
  teamScopeManagerId: null,
  teamScopeInitialized: false,
  setTeamScopeManagerId: (id) => set({ teamScopeManagerId: id }),
  initTeamScope: (managerId) => set({ teamScopeManagerId: managerId, teamScopeInitialized: true }),
}));
