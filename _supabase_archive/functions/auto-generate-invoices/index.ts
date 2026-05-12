import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log("Starting auto-generate-invoices job...");

    const today = new Date().toISOString().split('T')[0];

    // Get all recurring invoices that need to be generated today
    const { data: recurringInvoices, error: fetchError } = await supabase
      .from('recurring_invoices')
      .select('*')
      .eq('is_active', true)
      .lte('next_invoice_date', today);

    if (fetchError) {
      console.error("Error fetching recurring invoices:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${recurringInvoices?.length || 0} recurring invoices to process`);

    let generatedCount = 0;
    const errors: string[] = [];

    for (const recurring of recurringInvoices || []) {
      try {
        // Generate invoice number
        const { count } = await supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true });
        
        const invoiceNumber = `INV-${String((count || 0) + 1).padStart(6, '0')}`;

        // Create invoice
        const { data: newInvoice, error: insertError } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber,
            client_id: recurring.client_id,
            partner_id: recurring.partner_id,
            scheme: recurring.scheme,
            partner_commission_rate: recurring.partner_commission_rate,
            status: 'draft',
            created_by: recurring.created_by,
            notes: `Автоматически создан из расписания: ${recurring.notes || ''}`.trim(),
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error creating invoice for recurring ${recurring.id}:`, insertError);
          errors.push(`Recurring ${recurring.id}: ${insertError.message}`);
          continue;
        }

        console.log(`Created invoice ${invoiceNumber} from recurring ${recurring.id}`);

        // Calculate next invoice date
        const currentDate = new Date(recurring.next_invoice_date);
        let nextDate: Date;

        if (recurring.frequency === 'monthly') {
          nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, recurring.day_of_month);
        } else if (recurring.frequency === 'quarterly') {
          nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, recurring.day_of_month);
        } else { // yearly
          nextDate = new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), recurring.day_of_month);
        }

        // Update recurring invoice
        const { error: updateError } = await supabase
          .from('recurring_invoices')
          .update({
            next_invoice_date: nextDate.toISOString().split('T')[0],
            last_generated_at: new Date().toISOString(),
          })
          .eq('id', recurring.id);

        if (updateError) {
          console.error(`Error updating recurring ${recurring.id}:`, updateError);
          errors.push(`Update recurring ${recurring.id}: ${updateError.message}`);
        }

        generatedCount++;
      } catch (err: any) {
        console.error(`Exception processing recurring ${recurring.id}:`, err);
        errors.push(`Recurring ${recurring.id}: ${err.message}`);
      }
    }

    console.log(`Successfully generated ${generatedCount} invoices`);
    if (errors.length > 0) {
      console.log(`Errors encountered: ${errors.join('; ')}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        generatedCount,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Fatal error in auto-generate-invoices:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});