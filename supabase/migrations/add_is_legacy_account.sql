-- ============================================================
-- Script A: Add is_legacy_account column
-- Run first. Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- ============================================================
-- Adds an explicit, durable discriminator to identify Tenant Admin accounts
-- that were created before the trial lifecycle system was introduced.
-- Existing rows receive FALSE by the column default; no existing business
-- fields (plan_type, subscription_status, trial_ends_at) are changed.
-- New INSERTs always receive FALSE automatically — no trigger change required.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_legacy_account BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================
-- Script B-preview: Review before updating
-- Run this SELECT and confirm the returned accounts are exactly
-- the non-free, non-active-Razorpay, no-trial-dates tenants
-- you intend to mark as legacy. Do NOT run Script B-update
-- until this output matches expectations.
-- ============================================================

SELECT
  p.id,
  p.plan_type,
  p.subscription_status,
  p.trial_started_at,
  p.trial_ends_at,
  s.status AS saas_sub_status
FROM public.profiles p
LEFT JOIN public.saas_subscriptions s
  ON s.tenant_id = p.id
WHERE p.role = 'tenant_admin'
  AND p.plan_type <> 'free'
  AND p.trial_ends_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.saas_subscriptions sx
    WHERE sx.tenant_id = p.id
      AND sx.status = 'active'
  );


-- ============================================================
-- Script B-update: Precise legacy backfill
-- Run ONLY after confirming Script B-preview output.
-- Marks only accounts that genuinely need the compatibility
-- exemption: non-free tenant admins with no trial dates and
-- no active Razorpay subscription.
-- Accounts with an active saas_subscription are NOT marked
-- legacy — they are protected by Rule 5 and correctly
-- remain is_legacy_account=FALSE.
-- A manually suspended legacy account IS captured (no
-- subscription_status filter), and Rule 3 continues to
-- block it independently of is_legacy_account.
-- ============================================================

UPDATE public.profiles p
SET is_legacy_account = TRUE
WHERE p.role = 'tenant_admin'
  AND p.plan_type <> 'free'
  AND p.trial_ends_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.saas_subscriptions s
    WHERE s.tenant_id = p.id
      AND s.status = 'active'
  );


-- ============================================================
-- Script B-verify: Confirm backfill results
-- Run after Script B-update to verify exactly which rows
-- were marked is_legacy_account=TRUE.
-- ============================================================

SELECT
  p.id,
  p.plan_type,
  p.subscription_status,
  p.is_legacy_account,
  p.trial_ends_at,
  s.status AS saas_sub_status
FROM public.profiles p
LEFT JOIN public.saas_subscriptions s
  ON s.tenant_id = p.id
WHERE p.role = 'tenant_admin'
  AND p.plan_type <> 'free'
ORDER BY p.is_legacy_account DESC, p.plan_type;
