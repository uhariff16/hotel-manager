-- SQL to add WhatsApp template columns to tenant_integrations
-- Run this in your Supabase SQL Editor if you want database persistence for templates.

ALTER TABLE public.tenant_integrations 
  ADD COLUMN IF NOT EXISTS whatsapp_confirm_msg_template TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_receipt_msg_template TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_msg_template TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_review_msg_template TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_custom_tags JSONB,
  ADD COLUMN IF NOT EXISTS whatsapp_share_template TEXT;
