import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useSettingsStore = create(
  persist(
    (set) => ({
      theme: 'system',
      resortName: 'Stay Pilot',
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
      landingPageContent: null,
      websitePricing: null,
      onboardingWizardEnabled: true,
      isDataLoaded: false,
      
      updateSettings: (newSettings) => set((state) => ({ ...state, ...newSettings })),
      setIsDataLoaded: (loaded) => set({ isDataLoaded: loaded }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'system' ? 'light' : (state.theme === 'light' ? 'dark' : 'system') })),
      
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setResorts: (resorts) => set({ resorts }),
      setActiveResortId: (id) => set({ activeResortId: id }),
      setIsRecovering: (isRecovering) => set({ isRecovering }),
      setGlobalPlans: (globalPlans) => set({ globalPlans }),
      setLandingPageContent: (landingPageContent) => set({ landingPageContent }),
      setWebsitePricing: (websitePricing) => set({ websitePricing }),
      setOnboardingWizardEnabled: (enabled) => set({ onboardingWizardEnabled: enabled }),
      logout: () => set({ session: null, profile: null, resorts: [], activeResortId: null, isRecovering: false, globalPlans: null, landingPageContent: null, websitePricing: null, onboardingWizardEnabled: true })
    }),
    {
      name: 'hotel-manager-settings',
    }
  )
);
