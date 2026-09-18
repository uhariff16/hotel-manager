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
    const localSkipped = localStorage.getItem('staypilot_tour_skipped') === 'true';
    const dbSkipped = profile?.global_settings?.has_seen_tour === true;
    
    // profile.has_seen_tour might be undefined, so we check !== true
    if (profile && profile.has_seen_tour !== true && !localSkipped && !dbSkipped) {
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
    
    // If the tour ends for ANY reason (finished, skipped, crashed/error, or closed)
    if (
      ['finished', 'skipped', 'error'].includes(status) || 
      action === 'close' || 
      type === 'tour:end'
    ) {
      setRun(false);

      // Immediate local cache to prevent refresh race condition
      localStorage.setItem('staypilot_tour_skipped', 'true');

      // 1. Update Zustand store so it stops immediately
      setProfile({ ...profile, has_seen_tour: true });
      
      // 2. Safely update Supabase profiles table directly via global_settings
      try {
        const currentGlobal = profile?.global_settings || {};
        const newGlobal = { ...currentGlobal, has_seen_tour: true };
        
        await supabase.from('profiles').update({ 
          global_settings: newGlobal 
        }).eq('id', profile.id);
        
        await supabase.auth.updateUser({
          data: { has_seen_feature_tour: true }
        });
      } catch (err) {
        console.error("Failed to update tour metadata", err);
      }
    }
  };

  // Check Auth metadata flag
  const [hasSeenAuth, setHasSeenAuth] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.has_seen_feature_tour) {
        setHasSeenAuth(true);
      }
      setIsChecking(false);
    });
  }, []);

  const localSkipped = localStorage.getItem('staypilot_tour_skipped') === 'true';
  const dbSkipped = profile?.global_settings?.has_seen_tour === true;

  if (
    isChecking ||
    localSkipped ||
    dbSkipped ||
    !profile || 
    profile.has_seen_tour || 
    hasSeenAuth ||
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
      locale={{
        last: 'End Tour'
      }}
      steps={steps}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#056143', // Use brand green
          textColor: '#333',
        }
      }}
    />
  );
}
