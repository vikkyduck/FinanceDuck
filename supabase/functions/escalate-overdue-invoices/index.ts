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

    console.log("Starting escalate-overdue-invoices job...");

    const today = new Date();
    
    // Get all overdue invoices
    const { data: overdueInvoices, error: fetchError } = await supabase
      .from('invoices')
      .select('id, payment_date, priority_level')
      .eq('status', 'sent')
      .not('payment_date', 'is', null);

    if (fetchError) {
      console.error("Error fetching invoices:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${overdueInvoices?.length || 0} sent invoices to check`);

    let escalatedCount = 0;
    const updates: { id: string; oldLevel: string; newLevel: string; overdueDays: number }[] = [];

    for (const invoice of overdueInvoices || []) {
      const paymentDate = new Date(invoice.payment_date);
      const diffTime = today.getTime() - paymentDate.getTime();
      const overdueDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (overdueDays <= 0) continue; // Not overdue

      let newPriority: string = invoice.priority_level || 'normal';

      // Escalation rules
      if (overdueDays > 30 && newPriority !== 'critical') {
        newPriority = 'critical';
      } else if (overdueDays > 14 && newPriority === 'normal') {
        newPriority = 'high';
      }

      if (newPriority !== invoice.priority_level) {
        const { error: updateError } = await supabase
          .from('invoices')
          .update({ priority_level: newPriority })
          .eq('id', invoice.id);

        if (updateError) {
          console.error(`Error updating invoice ${invoice.id}:`, updateError);
        } else {
          escalatedCount++;
          updates.push({
            id: invoice.id,
            oldLevel: invoice.priority_level || 'normal',
            newLevel: newPriority,
            overdueDays,
          });
          console.log(`Escalated invoice ${invoice.id}: ${invoice.priority_level} -> ${newPriority} (${overdueDays} days overdue)`);
        }
      }
    }

    console.log(`Escalated ${escalatedCount} invoices`);

    return new Response(
      JSON.stringify({
        success: true,
        escalatedCount,
        updates: updates.length > 0 ? updates : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error("Fatal error in escalate-overdue-invoices:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});