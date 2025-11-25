-- Create table for monthly financial plans
CREATE TABLE IF NOT EXISTS public.monthly_financial_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  planned_admin_share NUMERIC NOT NULL DEFAULT 0,
  planned_cat_share NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  UNIQUE(year, month)
);

-- Enable RLS
ALTER TABLE public.monthly_financial_plans ENABLE ROW LEVEL SECURITY;

-- Admin can view all plans
CREATE POLICY "Admins can view all plans"
ON public.monthly_financial_plans
FOR SELECT
USING (is_admin(get_session_token_id()));

-- Admin can insert plans
CREATE POLICY "Admins can insert plans"
ON public.monthly_financial_plans
FOR INSERT
WITH CHECK (is_admin(get_session_token_id()));

-- Admin can update plans
CREATE POLICY "Admins can update plans"
ON public.monthly_financial_plans
FOR UPDATE
USING (is_admin(get_session_token_id()));

-- Admin can delete plans
CREATE POLICY "Admins can delete plans"
ON public.monthly_financial_plans
FOR DELETE
USING (is_admin(get_session_token_id()));

-- Block anonymous access
CREATE POLICY "Block anonymous access to monthly_financial_plans"
ON public.monthly_financial_plans
FOR ALL
USING (false);

-- Trigger to update updated_at
CREATE TRIGGER update_monthly_financial_plans_updated_at
BEFORE UPDATE ON public.monthly_financial_plans
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();