import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';
import * as XLSX from 'https://esm.sh/xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InvoiceData {
  id: string;
  invoice_number: string;
  client_name: string;
  partner_name: string;
  scheme: string;
  status: string;
  created_at: string;
  payment_date: string | null;
  partner_commission_rate: number | null;
  client_bill: number;
  commission_amount: number | null;
  amount_to_admin: number | null;
  agency_margin: number | null;
  executor_expenses_total: number;
  client_remaining: number | null;
  net_profit_admin: number;
  admin_share_50: number;
  cat_share_50: number;
  partner_share_from_margin: number | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Get token_id and filters from request body
    const { 
      token_id, 
      date_from,
      date_to,
      actual_date_from,
      actual_date_to,
      statuses,
      partner_ids
    } = await req.json();
    
    console.log('Export request with filters:', { 
      date_from, date_to, actual_date_from, actual_date_to, 
      statuses: statuses?.length, partner_ids: partner_ids?.length 
    });
    
    if (!token_id) {
      return new Response(
        JSON.stringify({ error: 'No token_id provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Set session context before authorization checks
    await supabase.rpc('set_session_context', { _token_id: token_id });
    
    // Validate user has admin or assistant role
    const { data: isAdmin, error: adminError } = await supabase
      .rpc('is_admin', { _token_id: token_id });
    
    const { data: isAssistant, error: assistantError } = await supabase
      .rpc('is_assistant', { _token_id: token_id });

    if (adminError || assistantError) {
      return new Response(
        JSON.stringify({ error: 'Authorization failed' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!isAdmin && !isAssistant) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Admin or assistant role required.' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Build invoices query with filters
    let invoicesQuery = supabase
      .from('invoices')
      .select(`
        *,
        clients(name, phone, telegram),
        partners(name, phone, telegram),
        invoice_calculations(*),
        executor_expenses(*)
      `);

    // Apply date filters for payment_date (planned)
    if (date_from) {
      invoicesQuery = invoicesQuery.gte('payment_date', date_from);
    }
    if (date_to) {
      invoicesQuery = invoicesQuery.lte('payment_date', date_to);
    }

    // Apply date filters for actual_payment_date (actual)
    if (actual_date_from) {
      invoicesQuery = invoicesQuery.gte('actual_payment_date', actual_date_from);
    }
    if (actual_date_to) {
      invoicesQuery = invoicesQuery.lte('actual_payment_date', actual_date_to);
    }

    // Apply status filter
    if (statuses && Array.isArray(statuses) && statuses.length > 0) {
      invoicesQuery = invoicesQuery.in('status', statuses);
    }

    // Apply partner filter
    if (partner_ids && Array.isArray(partner_ids) && partner_ids.length > 0) {
      invoicesQuery = invoicesQuery.in('partner_id', partner_ids);
    }

    const { data: invoices, error: invoicesError } = await invoicesQuery
      .order('created_at', { ascending: false });

    if (invoicesError) throw invoicesError;

    // Fetch all partners
    const { data: partners, error: partnersError } = await supabase
      .from('partners')
      .select('*')
      .order('name');

    if (partnersError) throw partnersError;

    // Fetch all clients with their partners
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select(`
        *,
        client_partners(
          partner_id,
          partners(name)
        )
      `)
      .order('name');

    if (clientsError) throw clientsError;

    // Fetch partner payments
    const { data: partnerPayments, error: paymentsError } = await supabase
      .from('partner_payments')
      .select('*, partners(name), invoices(invoice_number)')
      .order('payment_date', { ascending: false });

    if (paymentsError) throw paymentsError;

    // Fetch client payments
    const { data: clientPayments, error: clientPaymentsError } = await supabase
      .from('client_payments')
      .select('*, invoices(invoice_number, clients(name))')
      .order('payment_date', { ascending: false });

    if (clientPaymentsError) throw clientPaymentsError;

    // Helper function to safely format numbers
    const formatNumber = (value: number | null | undefined): number | null => {
      return (value !== null && value !== undefined && !isNaN(value)) ? value : null;
    };

    // Validate data exists
    if (!invoices || invoices.length === 0) {
      console.log('No invoices data found');
    }

    // Prepare invoices data
    const invoicesData = invoices?.map(inv => {
      const calc = inv.invoice_calculations?.[0] || {};
      return {
        'Номер счета': inv.invoice_number || '',
        'Клиент': inv.clients?.name || '',
        'Телефон клиента': inv.clients?.phone || '',
        'Telegram клиента': inv.clients?.telegram || '',
        'Партнер': inv.partners?.name || '',
        'Телефон партнера': inv.partners?.phone || '',
        'Telegram партнера': inv.partners?.telegram || '',
        'Схема': inv.scheme === 'agency_30' ? 'Агентская 30%' : 'Комиссионная',
        'Комиссия партнера %': formatNumber(inv.partner_commission_rate),
        'Статус': inv.status === 'draft' ? 'Черновик' : inv.status === 'sent' ? 'Отправлен' : inv.status === 'paid' ? 'Оплачен' : 'Отменен',
        'Дата создания': new Date(inv.created_at).toLocaleDateString('ru-RU'),
        'Дата оплаты': inv.payment_date ? new Date(inv.payment_date).toLocaleDateString('ru-RU') : '',
        'Факт. оплата': inv.actual_payment_date ? new Date(inv.actual_payment_date).toLocaleDateString('ru-RU') : '',
        'Счет клиенту': formatNumber(calc.client_bill) || 0,
        'Маржа агентства': formatNumber(calc.agency_margin),
        'Комиссия (сумма)': formatNumber(calc.commission_amount),
        'К поступлению админу': formatNumber(calc.amount_to_admin),
        'Расходы исполнителя': formatNumber(calc.executor_expenses_total) || 0,
        'Остаток у клиента': formatNumber(calc.client_remaining),
        'Чистая прибыль админа': formatNumber(calc.net_profit_admin) || 0,
        'Доля админа (50%)': formatNumber(calc.admin_share_50) || 0,
        'Доля кота (50%)': formatNumber(calc.cat_share_50) || 0,
        'Выплата партнеру': formatNumber(calc.partner_share_from_margin) || formatNumber(calc.commission_amount),
        'Примечания': inv.notes || '',
      };
    }) || [];

    // Prepare expenses data
    const expensesData: any[] = [];
    invoices?.forEach(inv => {
      inv.executor_expenses?.forEach((expense: any) => {
        expensesData.push({
          'Номер счета': inv.invoice_number,
          'Клиент': inv.clients?.name || '',
          'Дата расхода': new Date(expense.date).toLocaleDateString('ru-RU'),
          'Описание': expense.description,
          'Сумма': expense.amount,
          'Дата добавления': new Date(expense.created_at).toLocaleDateString('ru-RU'),
        });
      });
    });

    // Prepare partners data
    const partnersData = partners?.map(p => ({
      'Название': p.name,
      'Телефон': p.phone || '',
      'Telegram': p.telegram || '',
      'Дата создания': new Date(p.created_at).toLocaleDateString('ru-RU'),
    })) || [];

    // Prepare clients data
    const clientsData = clients?.map(c => {
      const partnerNames = c.client_partners?.map((cp: any) => cp.partners?.name).filter(Boolean).join(', ') || '';
      return {
        'Название': c.name,
        'Телефон': c.phone || '',
        'Telegram': c.telegram || '',
        'Партнеры': partnerNames,
        'Дата создания': new Date(c.created_at).toLocaleDateString('ru-RU'),
      };
    }) || [];

    // Prepare partner payments data
    const partnerPaymentsData = partnerPayments?.map(pp => ({
      'Партнер': pp.partners?.name || '',
      'Счет': pp.invoices?.invoice_number || '',
      'Дата платежа': new Date(pp.payment_date).toLocaleDateString('ru-RU'),
      'Сумма': pp.amount,
      'Примечания': pp.notes || '',
    })) || [];

    // Prepare client payments data
    const clientPaymentsData = clientPayments?.map(cp => ({
      'Клиент': cp.invoices?.clients?.name || '',
      'Счет': cp.invoices?.invoice_number || '',
      'Дата платежа': new Date(cp.payment_date).toLocaleDateString('ru-RU'),
      'Сумма': cp.amount,
      'Способ оплаты': cp.payment_method || '',
      'Примечания': cp.notes || '',
    })) || [];

    // Summary data
    const totalInvoicesAmount = invoicesData.reduce((sum, inv) => sum + (inv['Счет клиенту'] || 0), 0);
    const totalExpenses = invoicesData.reduce((sum, inv) => sum + (inv['Расходы исполнителя'] || 0), 0);
    const totalAdminProfit = invoicesData.reduce((sum, inv) => sum + (inv['Чистая прибыль админа'] || 0), 0);
    const totalPartnerPayments = partnerPaymentsData.reduce((sum, pp) => sum + (pp['Сумма'] || 0), 0);
    const totalClientPayments = clientPaymentsData.reduce((sum, cp) => sum + (cp['Сумма'] || 0), 0);

    const summaryData = [{
      'Показатель': 'Общая сумма счетов',
      'Значение': totalInvoicesAmount,
    }, {
      'Показатель': 'Всего расходов исполнителей',
      'Значение': totalExpenses,
    }, {
      'Показатель': 'Общая чистая прибыль админа',
      'Значение': totalAdminProfit,
    }, {
      'Показатель': 'Всего выплачено партнерам',
      'Значение': totalPartnerPayments,
    }, {
      'Показатель': 'Всего получено от клиентов',
      'Значение': totalClientPayments,
    }, {
      'Показатель': 'Всего счетов',
      'Значение': invoices?.length || 0,
    }, {
      'Показатель': 'Всего партнеров',
      'Значение': partners?.length || 0,
    }, {
      'Показатель': 'Всего клиентов',
      'Значение': clients?.length || 0,
    }];

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Set workbook properties for better compatibility
    wb.Props = {
      Title: "Экспорт данных",
      Subject: "Финансовый отчет",
      Author: "Invoice System",
      CreatedDate: new Date()
    };

    // Add sheets with proper error handling
    const addSheet = (data: any[], name: string) => {
      const ws = XLSX.utils.json_to_sheet(data.length > 0 ? data : [{ 'Нет данных': '' }]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    };

    addSheet(summaryData, 'Сводка');
    addSheet(invoicesData, 'Счета');
    addSheet(expensesData, 'Расходы');
    addSheet(partnersData, 'Партнеры');
    addSheet(clientsData, 'Клиенты');
    addSheet(partnerPaymentsData, 'Выплаты партнерам');
    addSheet(clientPaymentsData, 'Платежи клиентов');

    console.log('Workbook created with sheets:', wb.SheetNames);

    // Generate Excel file with proper settings for maximum compatibility
    const excelBuffer = XLSX.write(wb, { 
      type: 'buffer',
      bookType: 'xlsx',
      bookSST: true,
      compression: true
    });
    
    console.log('Excel buffer size:', excelBuffer.length);
    
    // Log the export operation
    const totalRecords = (invoices?.length || 0) + (clients?.length || 0) + 
                        (partners?.length || 0) +
                        (partnerPayments?.length || 0) + (clientPayments?.length || 0);
    
    try {
      await supabase.rpc('log_data_export', {
        _export_type: 'admin_full_export',
        _record_count: totalRecords,
        _token_id: token_id
      });
    } catch {
      // Silent fail - continue with export
    }

    const fileName = `admin_export_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Return binary response with proper headers
    return new Response(excelBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': excelBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
