import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'light',
      resortName: 'Hotel Manager',
      primaryColor: '#2f855a',
      contactPhone: '',
      contactEmail: '',
      logoUrl: null,
      
      // SaaS State
      session: null,
      profile: null,
      resorts: [],
      activeResortId: null,
      isRecovering: false,
      globalPlans: null,
      
      updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setResorts: (resorts) => set({ resorts }),
      setActiveResortId: (id) => set({ activeResortId: id }),
      setIsRecovering: (isRecovering) => set({ isRecovering }),
      setGlobalPlans: (globalPlans) => set({ globalPlans }),
      logout: () => set({ session: null, profile: null, resorts: [], activeResortId: null, isRecovering: false, globalPlans: null })
    }),
    {
      name: 'hotel-manager-settings',
    }
  )
);
