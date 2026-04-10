import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'light', // can be 'light' or 'dark'
      resortName: 'Hotel Manager',
      primaryColor: '#2f855a',
      contactPhone: '',
      contactEmail: '',
      logoUrl: null,
      updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'hotel-manager-settings',
    }
  )
);
