-- Migration: 20261007173500_update_published_pricing_display_order.sql
-- Description: Set authoritative displayOrder values (Solo=1, Growth=2, Stay Master=3) in super_admin published website pricing

UPDATE public.profiles
SET global_settings = jsonb_set(
  jsonb_set(
    jsonb_set(
      global_settings,
      '{website_pricing,published,custom_1786983013013,displayOrder}',
      '1'::jsonb
    ),
    '{website_pricing,published,pro,displayOrder}',
    '2'::jsonb
  ),
  '{website_pricing,published,premium,displayOrder}',
  '3'::jsonb
)
WHERE role = 'super_admin'
  AND global_settings IS NOT NULL
  AND global_settings ? 'website_pricing';
