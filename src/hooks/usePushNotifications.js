import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';

export function usePushNotifications() {
  const { session } = useSettingsStore();

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !session?.user?.id) return;

    let isSubscribed = true;

    const setupPushNotifications = async () => {
      try {
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') return;

        await PushNotifications.register();

        PushNotifications.addListener('registration', async (token) => {
          if (isSubscribed) {
            await supabase.from('fcm_tokens').upsert(
              { user_id: session.user.id, token: token.value, platform: Capacitor.getPlatform() },
              { onConflict: 'user_id,token' }
            );
          }
        });
      } catch (error) {
        console.error('Failed to setup push notifications:', error);
      }
    };
    setupPushNotifications();
    return () => { isSubscribed = false; PushNotifications.removeAllListeners(); };
  }, [session?.user?.id]);
}
