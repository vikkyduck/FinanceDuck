-- Create working_capital_balance table
CREATE TABLE IF NOT EXISTS public.working_capital_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.access_tokens(id),
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.working_capital_balance ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage working capital"
  ON public.working_capital_balance
  FOR ALL
  TO authenticated
  USING (is_admin(get_session_token_id()))
  WITH CHECK (is_admin(get_session_token_id()));

-- Insert initial record
INSERT INTO public.working_capital_balance (amount, notes)
VALUES (0, 'Initial balance')
ON CONFLICT DO NOTHING;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_working_capital_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_working_capital_timestamp
  BEFORE UPDATE ON public.working_capital_balance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_working_capital_timestamp();