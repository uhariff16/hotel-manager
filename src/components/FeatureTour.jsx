import React, { useState, useEffect } from 'react';
import * as ReactJoyride from 'react-joyride';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

const Joyride = ReactJoyride.default?.Joyride || ReactJoyride.default || ReactJoyride.Joyride || ReactJoyride;
const STATUS = ReactJoyride.STATUS || ReactJoyride.default?.STATUS;

export default function FeatureTour() {
  const { profile, setProfile } = useSettingsStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Determine if we should start the tour.
  useEffect(() => {
    if (profile && profile.has_seen_tour === false) {
      if (location.pathname === '/' || location.pathname === '/dashboard') {
        setRun(true);
      }
    }
  }, [profile, location.pathname]);

  const steps = [
    {
      target: 'body',
      content: 'Welcome to StayPilot! Let us show you around so you can start managing your properties effortlessly.',
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '.tour-dashboard',
      content: 'Here you can view your Dashboard metrics—see your total revenue, pending bookings, check-ins, and check-outs at a glance.',
      placement: 'right',
    },
    {
      target: '.tour-calendar',
      content: 'The Calendar gives you a visual timeline of all your bookings. Easily track availability and overlaps.',
      placement: 'right',
    },
    {
      target: '.tour-bookings',
      content: 'Ready to log a reservation? Click here to manage bookings and create new ones by assigning rooms instantly.',
      placement: 'right',
    },
    {
      target: '.tour-financials',
      content: 'Track your incomes and expenses here. You can manage advances, refunds, and daily expenditures.',
      placement: 'right',
    },
    {
      target: '.tour-management',
      content: 'Need to add a new cottage or room? Open the Management menu to define your real estate layout and manage staff.',
      placement: 'right',
    },
    {
      target: '.tour-settings',
      content: 'Finally, configure your WhatsApp integrations, GST templates, and resort settings in the Settings page.',
      placement: 'right',
    }
  ];

  const handleJoyrideCallback = async (data) => {
    const { status, type, action } = data;
    
    // If the user clicks skip, close, or finishes the tour
    if (['finished', 'skipped'].includes(status) || action === 'close') {
      setRun(false);
      
      // 1. Update Zustand store
      setProfile({ ...profile, has_seen_tour: true });
      
      // 2. Set strict localStorage fallback to guarantee it doesn't run again on this browser
      localStorage.setItem('has_seen_feature_tour', 'true');
      
      // 3. Update DB
      if (profile?.id) {
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ has_seen_tour: true })
            .eq('id', profile.id);
            
          if (error) {
            console.error("Failed to update tour status in DB. It might be missing the column.", error);
          }
        } catch (err) {
          console.error("Failed to update tour status in DB", err);
        }
      }
    }
  };

  // Check both DB flag and localStorage fallback
  if (
    !profile || 
    profile.has_seen_tour || 
    localStorage.getItem('has_seen_feature_tour') === 'true' || 
    Capacitor.isNativePlatform()
  ) {
    return null;
  }

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton={false}
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      steps={steps}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: 'var(--primary)',
        }
      }}
    />
  );
}
