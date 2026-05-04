# Plan: Tenant-Managed Email & WhatsApp Integration

This plan outlines the architecture for allowing individual tenants (resort owners) to configure and manage their own communication channels for automated guest notifications.

## 1. Database Architecture

We need a secure way to store tenant-specific credentials. We will create or extend a 'tenant_integrations' table.

### [NEW] 'tenant_integrations' Table
- id (UUID, Primary Key)
- tenant_id (UUID, References 'profiles.id' or 'resorts.id')
- Email Config:
  - email_provider (e.g., 'resend', 'sendgrid', 'smtp')
  - email_api_key (Encrypted string)
  - email_sender_id (e.g., info@resort.com)
  - email_sender_name (e.g., \"Cheerful Chalet Reception\")
- WhatsApp Config:
  - whatsapp_provider (e.g., 'meta_cloud', 'twilio')
  - whatsapp_access_token (Encrypted string)
  - whatsapp_phone_number_id (For Meta Cloud API)
  - whatsapp_business_account_id 
- Automation Toggles:
  - send_booking_confirmation (Boolean)
  - send_checkin_reminder (Boolean)
  - send_feedback_request (Boolean)

## 2. Frontend: Integration Settings UI

### [MODIFY] Settings.jsx
- Add a new \"Communications\" tab.
- Email Section:
  - Input fields for API Key and Sender Address.
  - A \"Test Connection\" button that sends a sample email to the tenant's own address.
- WhatsApp Section:
  - Configuration fields for the Meta Business API (Token and Phone ID).
  - Instructions link on how to get these keys.
- Automation Settings:
  - A list of checkboxes allowing the tenant to choose which events trigger an automatic message.

## 3. Communication Engine (Backend)

Since the frontend shouldn't handle sending emails directly (for security and reliability), we will use Supabase Edge Functions.

### Workflow:
1. Event Trigger: A new row is added to the 'bookings' table.
2. Database Webhook: Supabase triggers an Edge Function (e.g., 'handle-new-booking').
3. Tenant Context: The function fetches the specific 'tenant_integrations' for the booking's 'tenant_id'.
4. Dispatch: The function sends the email/WhatsApp using the tenant's own credentials.

## 4. Proposed Timeline

### Phase 1: Database & UI (1-2 Days)
- Create the 'tenant_integrations' table with Row Level Security (RLS).
- Build the Settings UI for managing keys.

### Phase 2: Email Integration (2 Days)
- Implement the Supabase Edge Function for sending emails via Resend/SendGrid.
- Connect the \"Booking Confirmation\" event.

### Phase 3: WhatsApp Integration (3 Days)
- Implement the Meta Cloud API integration.
- Note: Tenants will need a verified Meta Business Account for official WhatsApp branding.

### Phase 4: Templates & Customization (2 Days)
- Allow tenants to edit the *text* of their automated messages.

## Open Questions for USER

1. Service Preference: Do you have a preferred provider for Email (e.g., Resend, SendGrid) or WhatsApp (Official Meta API or a 3rd party like Twilio)?
2. Initial Automations: Which message is the highest priority? (e.g., Booking Confirmation, Check-in Reminder, or Payment Receipt?)
3. Encryption: Should we implement a vault for API keys, or is standard RLS sufficient for your security requirements at this stage?
