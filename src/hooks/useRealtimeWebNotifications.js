import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useSettingsStore } from '../lib/store';
import toast from 'react-hot-toast';

export function useRealtimeWebNotifications() {
  const { session, profile } = useSettingsStore();

  useEffect(() => {
    const tenantId = profile?.tenant_id || profile?.id;
    if (!session || !tenantId) return;

    const channel = supabase.channel('web-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;
          if (eventType === 'INSERT') {
            toast.success(`New Booking: ${newRecord.guest_name || 'Guest'}`, { duration: 5000, icon: '🏨' });
          } else if (eventType === 'UPDATE') {
            if (newRecord.status === 'Cancelled' && oldRecord?.status !== 'Cancelled') {
              toast.error(`Booking Cancelled: ${newRecord.guest_name || 'Guest'}`, { duration: 5000, icon: '❌' });
            }
          } else if (eventType === 'DELETE') {
            toast.error(`Booking Deleted: ${oldRecord?.guest_name || 'Guest'}`, { duration: 5000, icon: '🗑️' });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session, profile]);
}
