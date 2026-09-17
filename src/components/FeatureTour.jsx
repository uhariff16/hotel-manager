import React, { useState, useEffect } from 'react';
import * as ReactJoyride from 'react-joyride';
import { useSettingsStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { useLocation, useNavigate } from 'react-router-dom';

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
      target: '.tour-properties',
      content: 'Need to add a new cottage or room? Head over to the Properties section to define your real estate layout.',
      placement: 'right',
    },
    {
      target: '.tour-settings',
      content: 'Finally, configure your WhatsApp integrations, GST templates, and resort settings in the Settings page.',
      placement: 'right',
    }
  ];

  // Filter steps to only include those whose targets exist in the DOM (except 'body')
  // We use a small delay or just rely on the component mounting.
  const [activeSteps, setActiveSteps] = useState(steps);
  
  useEffect(() => {
      // Small timeout to allow AppLayout navlinks to render
      setTimeout(() => {
          const validSteps = steps.filter(s => s.target === 'body' || document.querySelector(s.target));
          setActiveSteps(validSteps);
      }, 500);
  }, [profile, location.pathname]);

  const handleJoyrideCallback = async (data) => {
    const { status, type, index } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      // Update local state so it doesn't trigger again
      setProfile({ ...profile, has_seen_tour: true });
      
      // Update DB
      if (profile.id) {
        try {
          await supabase
            .from('profiles')
            .update({ has_seen_tour: true })
            .eq('id', profile.id);
        } catch (err) {
          console.error("Failed to update tour status in DB", err);
        }
      }
    }
  };

  if (!profile || profile.has_seen_tour) return null;

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      hideCloseButton={false}
      run={run}
      scrollToFirstStep
      showProgress
      showSkipButton
      steps={activeSteps}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: 'var(--primary)',
        }
      }}
    />
  );
}
