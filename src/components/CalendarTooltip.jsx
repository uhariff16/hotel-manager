import React from 'react';
import { format } from 'date-fns';
import { User, Phone, Calendar, Home, CreditCard } from 'lucide-react';

export default function CalendarTooltip({ booking, cottageName, rooms, position }) {
  if (!booking) return null;

  const roomNames = booking.booking_type === 'Entire Property' 
    ? 'Entire Property' 
    : (booking.room_ids || []).map(id => rooms.find(r => r.id === id)?.name).filter(Boolean).join(', ');

  return (
    <div style={{
      position: 'fixed',
      left: position.x + 20,
      top: position.y - 10,
      zIndex: 1000,
      width: '280px',
      background: 'var(--bg-secondary)',
      borderRadius: '16px',
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
      border: '1px solid var(--border)',
      padding: '1.25rem',
      pointerEvents: 'none',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ 
          width: '40px', height: '40px', borderRadius: '10px', 
          background: booking.status === 'Checked-in' ? '#6366f1' : 'var(--primary)', 
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 
        }}>
          {booking.guest_name.charAt(0)}
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-main)' }}>{booking.guest_name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>{booking.reference_number}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <Calendar size={14} color="var(--primary)" />
          <span style={{ fontWeight: 600 }}>{format(new Date(booking.check_in_date), 'dd MMM')} - {format(new Date(booking.check_out_date), 'dd MMM')}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{booking.night_count} nights</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <Home size={14} color="var(--primary)" />
          <span style={{ fontWeight: 600 }}>{cottageName}</span>
          <span style={{ color: 'var(--primary)', fontSize: '0.75rem', marginLeft: '0.25rem' }}>({roomNames})</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
          <Phone size={14} color="var(--primary)" />
          <span style={{ fontWeight: 600 }}>{booking.phone_number}</span>
        </div>
      </div>

      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: booking.balance_amount > 0 ? 'var(--warning)' : 'var(--success)' }}></div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>{booking.status}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', fontWeight: 800 }}>{booking.booking_source || 'Direct'}</span>
          <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>₹{booking.total_amount?.toLocaleString()}</div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95) translateX(-10px); }
          to { opacity: 1; transform: scale(1) translateX(0); }
        }
      `}</style>
    </div>
  );
}
