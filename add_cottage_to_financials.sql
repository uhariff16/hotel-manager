-- Add cottage_id column to incomes and expenses tables to link them to properties
ALTER TABLE public.incomes ADD COLUMN IF NOT EXISTS cottage_id UUID REFERENCES public.cottages(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS cottage_id UUID REFERENCES public.cottages(id) ON DELETE SET NULL;
