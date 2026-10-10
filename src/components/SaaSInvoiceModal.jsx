import React from 'react';
import { X, Printer, CheckCircle2, ShieldCheck } from 'lucide-react';

export default function SaaSInvoiceModal({ isOpen, onClose, payment, invoiceRecord, profile, globalTaxSettings }) {
  if (!isOpen || (!payment && !invoiceRecord)) return null;

  // Use immutable snapshot stored invoice record if available; otherwise calculate from payment & current tax settings
  const inv = invoiceRecord || payment?.saas_invoice;

  const isGstActive = inv 
    ? (inv.tax_type !== 'exempt' && Number(inv.gst_rate) > 0)
    : (Boolean(globalTaxSettings?.enabled) && Number(globalTaxSettings?.rate || 0) > 0);

  const gstRate = inv ? Number(inv.gst_rate || 0) : (isGstActive ? Number(globalTaxSettings.rate) : 0);
  const taxType = inv ? inv.tax_type : (isGstActive ? 'intra_state' : 'exempt');

  const totalPaise = inv ? Number(inv.total_amount_paise) : Number(payment.amount || 0);
  const totalRupees = totalPaise > 1000 ? totalPaise / 100 : totalPaise;

  let baseAmountRupees = inv ? Number(inv.base_amount_paise) / 100 : totalRupees;
  let gstAmountRupees = inv ? (Number(inv.total_amount_paise) - Number(inv.base_amount_paise)) / 100 : 0;

  if (!inv && isGstActive && gstRate > 0) {
    baseAmountRupees = Math.round((totalRupees / (1 + gstRate / 100)) * 100) / 100;
    gstAmountRupees = Math.round((totalRupees - baseAmountRupees) * 100) / 100;
  }

  const cgstRupees = inv ? Number(inv.cgst_amount_paise || 0) / 100 : (taxType === 'intra_state' ? gstAmountRupees / 2 : 0);
  const sgstRupees = inv ? Number(inv.sgst_amount_paise || 0) / 100 : (taxType === 'intra_state' ? gstAmountRupees / 2 : 0);
  const igstRupees = inv ? Number(inv.igst_amount_paise || 0) / 100 : (taxType === 'inter_state' ? gstAmountRupees : 0);

  const invoiceNumber = inv 
    ? inv.invoice_number 
    : `SP-INV-${new Date(payment.created_at).getFullYear()}-${(payment.id || '').substring(0, 8).toUpperCase()}`;

  const invoiceDate = new Date(inv?.issued_at || payment.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const tenantBilling = profile?.global_settings?.tenant_billing || {};
  const supplierName = inv?.supplier_name || globalTaxSettings?.companyName || 'Stay Pilot Hospitality SaaS';
  const supplierGstin = inv?.supplier_gstin || globalTaxSettings?.gstin || 'Unspecified';
  const supplierAddress = inv?.supplier_address || globalTaxSettings?.address || 'India';

  const customerName = inv?.customer_name || tenantBilling.companyName || profile?.full_name || 'Valued Tenant';
  const customerGstin = inv?.customer_gstin || tenantBilling.gstin;
  const customerAddress = inv?.customer_address || tenantBilling.address || 'Registered Property Address';
  const customerEmail = inv?.customer_email || profile?.email || 'N/A';

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 99999, background: 'rgba(0,0,0,0.75)' }}>
      <div className="modal-content" style={{ maxWidth: '680px', width: '100%', padding: 0, borderRadius: '16px', overflow: 'hidden', background: '#ffffff', color: '#1e293b' }}>
        
        {/* Action Header (Screen Only) */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={18} style={{ color: '#10b981' }} /> Stay Pilot Tax Invoice (Immutable Snapshot)
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={handlePrint}
              className="btn btn-outline"
              style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', borderRadius: '6px' }}
            >
              <Printer size={15} /> Print / Save PDF
            </button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '0.25rem' }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Invoice Printable Document */}
        <div id="saas-invoice-printable" style={{ padding: '2rem 2.25rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          
          {/* Header & Logo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', borderBottom: '2px solid #10b981', paddingBottom: '1.25rem' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>STAY PILOT</h1>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>Hospitality Management Software</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 800, color: isGstActive ? '#059669' : '#3b82f6', textTransform: 'uppercase' }}>
                {isGstActive ? 'Tax Invoice' : 'Payment Receipt'}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem', fontFamily: 'monospace' }}>{invoiceNumber}</div>
              <div style={{ fontSize: '0.825rem', color: '#64748b' }}>Date: {invoiceDate}</div>
            </div>
          </div>

          {/* Supplier & Customer Details Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem', fontSize: '0.875rem' }}>
            
            {/* Supplier / Billed By */}
            <div style={{ background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Billed By (Supplier)</div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{supplierName}</div>
              <div style={{ color: '#475569', marginTop: '0.25rem', whiteSpace: 'pre-line', lineHeight: 1.4 }}>{supplierAddress}</div>
              {isGstActive && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.825rem', color: '#334155' }}>
                  <strong>GSTIN:</strong> {supplierGstin}
                </div>
              )}
            </div>

            {/* Customer / Billed To */}
            <div style={{ background: '#f8fafc', padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Billed To (Customer)</div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>{customerName}</div>
              <div style={{ color: '#475569', marginTop: '0.25rem' }}>{customerAddress}</div>
              <div style={{ color: '#475569', fontSize: '0.825rem' }}>Email: {customerEmail}</div>
              {customerGstin && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.825rem', color: '#334155' }}>
                  <strong>Customer GSTIN:</strong> {customerGstin}
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                <th style={{ padding: '0.75rem 1rem', borderRadius: '6px 0 0 0' }}>Service Description</th>
                <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>SAC Code</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', borderRadius: '0 6px 0 0' }}>Taxable Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '1rem', color: '#0f172a' }}>
                  <div style={{ fontWeight: 700 }}>Stay Pilot SaaS Subscription</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Plan: {(inv?.plan_type || payment?.plan_type || 'Monthly Subscription').toUpperCase()} | Billed Monthly</div>
                </td>
                <td style={{ padding: '1rem 0.5rem', textAlign: 'center', fontFamily: 'monospace', color: '#475569' }}>998313</td>
                <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  ₹{baseAmountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Financial Calculation Totals with Place of Supply Breakdown */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '2rem' }}>
            <div style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                <span>Taxable Base Amount</span>
                <span>₹{baseAmountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>

              {isGstActive && taxType === 'intra_state' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>CGST ({gstRate / 2}%)</span>
                    <span>₹{cgstRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                    <span>SGST ({gstRate / 2}%)</span>
                    <span>₹{sgstRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </>
              )}

              {isGstActive && taxType === 'inter_state' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                  <span>IGST ({gstRate}%)</span>
                  <span>₹{igstRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '2px solid #0f172a', fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>
                <span>Total Amount Paid</span>
                <span>₹{totalRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          {/* Payment References & Legal Footer */}
          <div style={{ background: '#f1f5f9', padding: '1rem 1.25rem', borderRadius: '8px', fontSize: '0.825rem', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong>Payment Method:</strong> Razorpay Online Payment<br />
              <strong>Payment Ref:</strong> <span style={{ fontFamily: 'monospace' }}>{inv?.razorpay_payment_id || payment?.razorpay_payment_id || payment?.id}</span>
            </div>
            <div style={{ textAlign: 'right', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <CheckCircle2 size={16} /> Verified & Issued
            </div>
          </div>

          <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            This is an immutable computer-generated tax invoice issued by Stay Pilot. Questions? Email support@staypilot.co.in
          </div>
        </div>
      </div>
    </div>
  );
}
