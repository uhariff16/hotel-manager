import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, CheckCircle2, ShieldCheck, Ban, AlertTriangle, Clock } from 'lucide-react';

export default function SaaSInvoiceModal({ isOpen, onClose, payment, invoiceRecord, profile, globalTaxSettings }) {
  const overlayRef = useRef(null);
  const modalContentRef = useRef(null);
  const closeButtonRef = useRef(null);
  const scrollPositionRef = useRef({ windowY: 0, pageContentY: 0 });

  // Handle scroll locking, restoration, and keyboard accessibility
  useEffect(() => {
    if (!isOpen) return;

    // 1. Capture current scroll offsets before locking
    const currentWindowY = window.scrollY || document.documentElement.scrollTop || 0;
    const pageContentEl = document.querySelector('.page-content');
    const currentPageContentY = pageContentEl ? pageContentEl.scrollTop : 0;
    scrollPositionRef.current = { windowY: currentWindowY, pageContentY: currentPageContentY };

    // 2. Lock scrolling on body and layout container
    const originalBodyOverflow = document.body.style.overflow;
    const originalPageContentOverflow = pageContentEl ? pageContentEl.style.overflow : '';

    document.body.style.overflow = 'hidden';
    if (pageContentEl) {
      pageContentEl.style.overflow = 'hidden';
    }

    // 3. Focus close button or modal container for keyboard accessibility
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    } else if (modalContentRef.current) {
      modalContentRef.current.focus();
    }

    // 4. Keyboard event listener for Escape key
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup on close / unmount
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalBodyOverflow;
      if (pageContentEl) {
        pageContentEl.style.overflow = originalPageContentOverflow;
        pageContentEl.scrollTop = scrollPositionRef.current.pageContentY;
      }
      window.scrollTo({ top: scrollPositionRef.current.windowY, behavior: 'instant' });
    };
  }, [isOpen, onClose]);

  if (!isOpen || (!payment && !invoiceRecord)) return null;

  // Use immutable snapshot stored invoice record if available; otherwise calculate from payment & current tax settings
  const inv = invoiceRecord || payment?.saas_invoice || (Array.isArray(payment?.saas_invoices) ? payment.saas_invoices[0] : payment?.saas_invoices);

  const isVoided = inv?.invoice_status === 'void' || payment?.invoice_status === 'void';
  const isPending = !inv && payment?.invoice_status === 'pending';
  const isManualReview = !inv && payment?.invoice_status === 'manual_review';
  const isFailed = !inv && payment?.invoice_status === 'failed';

  const isGstActive = inv 
    ? (inv.tax_type !== 'exempt' && inv.tax_type !== 'unregistered' && Number(inv.gst_rate) > 0)
    : (Boolean(globalTaxSettings?.enabled) && Number(globalTaxSettings?.rate || 0) > 0);

  const gstRate = inv ? Number(inv.gst_rate || 0) : (isGstActive ? Number(globalTaxSettings.rate) : 0);
  const taxType = inv ? inv.tax_type : (isGstActive ? 'intra_state' : 'unregistered');

  const totalRupees = inv 
    ? Number(inv.total_amount_paise) / 100 
    : (Number(payment.amount || 0) > 1000 ? Number(payment.amount) / 100 : Number(payment.amount || 0));

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

  const tenantBilling = profile?.global_settings?.billing || profile?.global_settings?.tenant_billing || {};
  
  // Supplier Information from snapshot (Proprietor legal name, address, PAN, email, phone are optional)
  const supplierTradeName = inv?.supplier_trade_name || inv?.supplier_name || 'Stay Pilot';
  const supplierLegalName = inv?.supplier_legal_name || null;
  const supplierAddressParts = [
    inv?.supplier_address || (isGstActive ? globalTaxSettings?.address : null),
    inv?.supplier_city || null,
    inv?.supplier_state ? `${inv.supplier_state}${inv.supplier_pincode ? ` - ${inv.supplier_pincode}` : ''}` : null
  ].filter(Boolean);
  const supplierAddressFormatted = supplierAddressParts.length > 0 ? supplierAddressParts.join(', ') : null;
  const supplierGstin = isGstActive ? (inv?.supplier_gstin || globalTaxSettings?.gstin || null) : null;
  const supplierPan = inv?.supplier_pan || inv?.seller_snapshot?.pan || null;
  const supplierEmail = inv?.supplier_email || inv?.seller_snapshot?.email || null;
  const supplierPhone = inv?.supplier_phone || inv?.seller_snapshot?.phone || null;

  // Customer Information from snapshot
  const customerName = inv?.customer_name || tenantBilling.name || tenantBilling.companyName || profile?.full_name || 'Valued Tenant';
  const customerGstin = isGstActive ? (inv?.customer_gstin || tenantBilling.gstin) : null;
  const customerAddress = inv?.customer_address || tenantBilling.address || 'Registered Property Address';
  const customerEmail = inv?.customer_email || tenantBilling.email || profile?.email || 'N/A';
  const customerState = inv?.customer_state || tenantBilling.state || 'Karnataka';

  // Plan Details
  const rawPlan = inv?.plan_type || payment?.staypilot_plan_type || payment?.plan_type || 'Monthly Subscription';
  const planDisplay = (rawPlan === 'custom_1786983013013' || rawPlan.startsWith('custom_')) 
    ? 'SOLO' 
    : rawPlan.toUpperCase();

  const handlePrint = () => {
    // Small timeout ensures any layout calculations complete before invoking print dialog
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const handleBackdropClick = (e) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  return createPortal(
    <div className="saas-invoice-portal">
      {/* Scoped CSS for Viewport Alignment & Pristine Print Output */}
      <style>{`
        .saas-invoice-modal-overlay {
          position: fixed !important;
          inset: 0 !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          background: rgba(15, 23, 42, 0.75) !important;
          backdrop-filter: blur(4px) !important;
          z-index: 999999 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 1rem !important;
          box-sizing: border-box !important;
          margin: 0 !important;
        }

        .saas-invoice-modal-content {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          max-width: 680px !important;
          max-height: calc(100vh - 2rem) !important;
          max-height: calc(100dvh - 2rem) !important;
          background: #ffffff !important;
          color: #1e293b !important;
          border-radius: 16px !important;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4) !important;
          overflow: hidden !important;
          position: relative !important;
          border: 1px solid #e2e8f0 !important;
          padding: 0 !important;
          margin: 0 auto !important;
          outline: none !important;
        }

        .saas-invoice-action-header {
          flex-shrink: 0 !important;
          padding: 0.875rem 1.25rem !important;
          background: #f8fafc !important;
          border-bottom: 1px solid #e2e8f0 !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          gap: 0.75rem !important;
          z-index: 10 !important;
        }

        .saas-invoice-document {
          flex: 1 1 auto !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          -webkit-overflow-scrolling: touch !important;
          padding: 1.75rem 2rem !important;
          background: #ffffff !important;
          color: #0f172a !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }

        .saas-details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.25rem;
          margin-bottom: 1.75rem;
          font-size: 0.875rem;
        }

        @media (max-width: 640px) {
          .saas-invoice-modal-overlay {
            padding: 0.5rem !important;
          }
          .saas-invoice-modal-content {
            max-height: calc(100dvh - 1rem) !important;
            border-radius: 12px !important;
          }
          .saas-invoice-document {
            padding: 1rem 1.15rem !important;
          }
          .saas-details-grid {
            grid-template-columns: 1fr !important;
            gap: 1rem !important;
          }
        }

        /* Dedicated Print Stylesheet */
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm 12mm;
          }

          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Suppress main application */
          #root {
            display: none !important;
          }

          /* Hide action buttons and modal controls */
          .no-print,
          .no-print * {
            display: none !important;
            visibility: hidden !important;
          }

          /* Ensure portal is visible and cleanly positioned on paper */
          .saas-invoice-portal,
          .saas-invoice-portal * {
            visibility: visible !important;
          }

          .saas-invoice-portal {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .saas-invoice-modal-overlay {
            position: static !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            background: transparent !important;
            backdrop-filter: none !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
          }

          .saas-invoice-modal-content {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }

          .saas-invoice-document {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #0f172a !important;
            font-size: 9.5pt !important;
            line-height: 1.35 !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .saas-invoice-document table {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }

          .saas-invoice-document tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      <div 
        ref={overlayRef}
        className="modal-overlay saas-invoice-modal-overlay" 
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="saas-invoice-title"
      >
        <div 
          ref={modalContentRef}
          className="modal-content saas-invoice-modal-content"
          tabIndex={-1}
        >
          {/* Action Header (Screen Only) */}
          <div className="no-print saas-invoice-action-header">
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <ShieldCheck size={18} style={{ color: '#10b981', flexShrink: 0 }} /> 
              {isGstActive ? 'Stay Pilot Tax Invoice (Immutable Snapshot)' : 'Stay Pilot Commercial Payment Acknowledgment (Immutable Snapshot)'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-outline"
                style={{ 
                  padding: '0.4rem 0.85rem', 
                  fontSize: '0.825rem', 
                  fontWeight: 600,
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.4rem', 
                  borderRadius: '6px',
                  background: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer'
                }}
              >
                <Printer size={15} /> Print / Save PDF
              </button>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                aria-label="Close acknowledgment"
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer', 
                  color: '#64748b', 
                  padding: '0.35rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Invoice Printable Document */}
          <div id="saas-invoice-printable" className="saas-invoice-document">
            
            {/* Status Alert Banners */}
            {isVoided && (
              <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                <Ban size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
                <div>
                  <strong>DOCUMENT VOIDED:</strong> This document has been revoked. {inv?.void_reason ? `Reason: ${inv.void_reason}.` : ''} {inv?.voided_at ? `Voided on: ${new Date(inv.voided_at).toLocaleDateString('en-IN')}.` : ''}
                </div>
              </div>
            )}
            {isManualReview && (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#b45309', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <div>
                  <strong>PENDING VERIFICATION:</strong> Payment was received successfully. The commercial document is currently undergoing administrative review.
                </div>
              </div>
            )}

            {/* Header & Logo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem', borderBottom: '2px solid #10b981', paddingBottom: '1rem' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1 }}>STAY PILOT</h1>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.825rem', color: '#64748b', fontWeight: 500 }}>Hospitality Management Software</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div id="saas-invoice-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: isGstActive ? '#059669' : '#0284c7', textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                  {isGstActive ? 'Tax Invoice' : 'Commercial Payment Acknowledgment'}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#334155', marginTop: '0.25rem', fontFamily: 'monospace', fontWeight: 700 }}>{invoiceNumber}</div>
                <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.15rem' }}>Date: {invoiceDate}</div>
              </div>
            </div>

            {/* Supplier & Customer Details Grid */}
            <div className="saas-details-grid">
              
              {/* Supplier / Billed By */}
              <div style={{ background: '#f8fafc', padding: '1rem 1.15rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.725rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Billed By (Supplier)</div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{supplierTradeName}</div>
                {supplierLegalName && supplierLegalName !== supplierTradeName && (
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Proprietor: {supplierLegalName}</div>
                )}
                {supplierAddressFormatted && (
                  <div style={{ color: '#475569', marginTop: '0.35rem', lineHeight: 1.45, fontSize: '0.825rem' }}>{supplierAddressFormatted}</div>
                )}
                {supplierPan && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.8rem', color: '#334155' }}>
                    <strong>PAN:</strong> <span style={{ fontFamily: 'monospace' }}>{supplierPan}</span>
                  </div>
                )}
                {supplierEmail && (
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.15rem' }}>Email: {supplierEmail}</div>
                )}
                {supplierPhone && (
                  <div style={{ fontSize: '0.8rem', color: '#475569' }}>Phone: {supplierPhone}</div>
                )}
                {isGstActive && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.825rem', color: '#334155' }}>
                    <strong>GSTIN:</strong> {supplierGstin}
                  </div>
                )}
              </div>

              {/* Customer / Billed To */}
              <div style={{ background: '#f8fafc', padding: '1rem 1.15rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.725rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Billed To (Customer)</div>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{customerName}</div>
                <div style={{ color: '#475569', marginTop: '0.35rem', lineHeight: 1.45, fontSize: '0.825rem' }}>{customerAddress}</div>
                <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: '0.35rem' }}>State: {customerState}</div>
                <div style={{ color: '#475569', fontSize: '0.8rem' }}>Email: {customerEmail}</div>
                {customerGstin && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.825rem', color: '#334155' }}>
                    <strong>Customer GSTIN:</strong> {customerGstin}
                  </div>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 0.85rem', borderRadius: '6px 0 0 0', fontWeight: 700 }}>Service Description</th>
                  <th style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontWeight: 700 }}>SAC Code</th>
                  <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', borderRadius: '0 6px 0 0', fontWeight: 700 }}>{isGstActive ? 'Taxable Amount (₹)' : 'Amount (₹)'}</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '0.85rem', color: '#0f172a' }}>
                    <div style={{ fontWeight: 700 }}>Stay Pilot SaaS Subscription</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>Plan: {planDisplay} | Billed Monthly</div>
                  </td>
                  <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center', fontFamily: 'monospace', color: '#475569' }}>998313</td>
                  <td style={{ padding: '0.85rem', textAlign: 'right', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                    ₹{baseAmountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Financial Calculation Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.75rem' }}>
              <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.875rem' }}>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                  <span>{isGstActive ? 'Taxable Base Amount' : 'Base Subscription Amount'}</span>
                  <span style={{ fontWeight: 600 }}>₹{baseAmountRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {!isGstActive && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '0.8rem' }}>
                    <span>Tax (GST Disabled / Unregistered)</span>
                    <span>₹0.00</span>
                  </div>
                )}

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

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.65rem', borderTop: '2px solid #0f172a', fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>
                  <span>Total Amount Paid</span>
                  <span style={{ color: '#059669' }}>₹{totalRupees.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Payment References & Legal Verification Footer */}
            <div style={{ background: '#f1f5f9', padding: '0.85rem 1.15rem', borderRadius: '8px', fontSize: '0.825rem', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <div><strong>Payment Method:</strong> Razorpay Online Payment</div>
                <div style={{ marginTop: '0.15rem' }}>
                  <strong>Payment Reference:</strong> <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>{inv?.razorpay_payment_id || payment?.razorpay_payment_id || payment?.id}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                {isVoided ? (
                  <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Ban size={16} /> Revoked & Voided</span>
                ) : isManualReview ? (
                  <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={16} /> Under Administrative Review</span>
                ) : isPending ? (
                  <span style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={16} /> Generation in Progress</span>
                ) : isFailed ? (
                  <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><AlertTriangle size={16} /> Generation Failed</span>
                ) : (
                  <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.35rem' }}><CheckCircle2 size={16} /> Verified & Issued</span>
                )}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: '0.85rem', lineHeight: 1.4 }}>
              This is an immutable computer-generated {isGstActive ? 'tax invoice' : 'commercial payment acknowledgment'} issued by Stay Pilot. Questions? Email support@staypilot.co.in
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
