import React from 'react';
import { format } from 'date-fns';
import { useSettingsStore } from '../lib/store';

export default function BookingReceipt({ booking, resort, cottage }) {
  const { profile } = useSettingsStore();
  if (!booking) return null;

  // Use cottage ID for prefs if available, fallback to resort ID (though we only save by cottage now)
  const lookupId = cottage?.id || resort?.id;
  const prefs = profile?.global_settings?.invoice_preferences?.[lookupId] || {};
  const isA5 = prefs.format === 'A5';
  
  const displayPhone = prefs.phone || resort?.phone || 'N/A';
  const displayEmail = prefs.email || resort?.email || '';
  const displayLogo = prefs.logo_url || resort?.logo_url || '';
  
  const displayName = cottage?.name || resort?.name || 'Stay Pilot Property';

  return (
    <div className={`print-receipt-container ${isA5 ? 'a5-format' : 'a4-format'}`} style={{ padding: isA5 ? '20px' : '40px', background: 'white', color: 'black', fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #eee', paddingBottom: isA5 ? '10px' : '20px', marginBottom: isA5 ? '15px' : '30px' }}>
        <div>
          {displayLogo && <img src={displayLogo} alt="Logo" style={{ maxHeight: isA5 ? '60px' : '90px', maxWidth: isA5 ? '150px' : '220px', objectFit: 'contain', marginBottom: '10px' }} />}
          <h1 style={{ margin: 0, fontSize: isA5 ? '20px' : '28px', color: '#111' }}>{displayName}</h1>
          <p style={{ margin: '5px 0 0', color: '#555', fontSize: isA5 ? '12px' : '16px' }}>Phone: {displayPhone}</p>
          {displayEmail && <p style={{ margin: '2px 0 0', color: '#555', fontSize: isA5 ? '12px' : '16px' }}>Email: {displayEmail}</p>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <h2 style={{ margin: 0, fontSize: isA5 ? '18px' : '24px', color: '#333' }}>PAYMENT RECEIPT</h2>
          <p style={{ margin: '5px 0 0', color: '#777', fontSize: isA5 ? '12px' : '16px' }}>Date: {format(new Date(), 'dd MMM yyyy')}</p>
          <p style={{ margin: '5px 0 0', color: '#777', fontSize: isA5 ? '12px' : '16px' }}>Receipt #: {displayName ? displayName.substring(0,3).toUpperCase() : 'RC'}-{booking.reference_number.split('-').pop()}</p>
          <p style={{ margin: '5px 0 0', color: '#777', fontSize: isA5 ? '12px' : '16px' }}>Ref #: <strong style={{ color: '#111' }}>{booking.reference_number}</strong></p>
          <p style={{ margin: '5px 0 0', color: '#777', fontSize: isA5 ? '12px' : '16px' }}>Status: <strong style={{ color: booking.status === 'Confirmed' ? '#16a34a' : booking.status === 'Cancelled' ? '#dc2626' : '#ca8a04' }}>{booking.status?.toUpperCase()}</strong></p>
        </div>
      </div>

      {/* Guest Details */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#555', textTransform: 'uppercase' }}>Billed To:</h3>
          <p style={{ margin: '0 0 5px', fontWeight: 'bold', fontSize: '18px' }}>{booking.guest_name}</p>
          <p style={{ margin: '0 0 5px', color: '#444' }}>Phone: {booking.guest_phone || 'N/A'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '16px', color: '#555', textTransform: 'uppercase' }}>Stay Details:</h3>
          <p style={{ margin: '0 0 5px' }}><strong>Check-in:</strong> {format(new Date(booking.check_in_date), 'dd MMM yyyy')} {booking.check_in_time && `(${booking.check_in_time})`}</p>
          <p style={{ margin: '0 0 5px' }}><strong>Check-out:</strong> {format(new Date(booking.check_out_date), 'dd MMM yyyy')} {booking.check_out_time && `(${booking.check_out_time})`}</p>
          <p style={{ margin: '0 0 5px' }}><strong>Units:</strong> {booking.room_numbers || 'N/A'}</p>
        </div>
      </div>

      {/* Financials Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f9f9f9', borderBottom: '2px solid #ddd' }}>
            <th style={{ padding: '12px', textAlign: 'left', color: '#333' }}>Description</th>
            <th style={{ padding: '12px', textAlign: 'right', color: '#333' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #eee' }}>
            <td style={{ padding: '12px' }}>Base Accommodation Charge</td>
            <td style={{ padding: '12px', textAlign: 'right' }}>₹{(booking.base_amount || 0).toLocaleString()}</td>
          </tr>
          {(booking.addons_cost > 0) && (
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '12px' }}>Add-ons / Extra Services</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>₹{(booking.addons_cost || 0).toLocaleString()}</td>
            </tr>
          )}
          {(booking.extra_guest_charges > 0) && (
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '12px' }}>Extra Guest Charges</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>₹{(booking.extra_guest_charges || 0).toLocaleString()}</td>
            </tr>
          )}
          {(booking.discount_amount > 0) && (
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '12px' }}>Discount Applied</td>
              <td style={{ padding: '12px', textAlign: 'right', color: '#d32f2f' }}>- ₹{(booking.discount_amount || 0).toLocaleString()}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ width: '300px', marginLeft: 'auto', marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
          <strong style={{ color: '#555' }}>Total Amount:</strong>
          <strong>₹{(booking.total_amount || 0).toLocaleString()}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #eee' }}>
          <strong style={{ color: '#555' }}>Amount Paid:</strong>
          <strong style={{ color: '#2e7d32' }}>₹{((booking.total_amount || 0) - (booking.balance_amount || 0)).toLocaleString()}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: '18px' }}>
          <strong>Balance Due:</strong>
          <strong style={{ color: booking.balance_amount > 0 ? '#d32f2f' : '#333' }}>₹{(booking.balance_amount || 0).toLocaleString()}</strong>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', color: '#777', fontSize: '14px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <p style={{ margin: '0 0 5px' }}>Thank you for choosing {resort?.name || 'us'}!</p>
        <p style={{ margin: 0, fontSize: '12px' }}>This is a computer-generated receipt.</p>
      </div>
    </div>
  );
}
