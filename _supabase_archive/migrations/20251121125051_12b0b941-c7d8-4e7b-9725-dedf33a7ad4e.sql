-- Add actual_payment_date column to invoices table for tracking when payment was actually received
ALTER TABLE public.invoices 
ADD COLUMN actual_payment_date date;

COMMENT ON COLUMN public.invoices.payment_date IS 'Предполагаемая/запланированная дата оплаты';
COMMENT ON COLUMN public.invoices.actual_payment_date IS 'Фактическая дата поступления оплаты';