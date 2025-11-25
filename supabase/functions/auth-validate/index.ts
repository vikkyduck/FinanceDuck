import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const getCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || 'https://99d5461e-ad68-4d98-ab03-7671a8370b23.lovableproject.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cookie, x-csrf-token',
  'Access-Control-Allow-Credentials': 'true',
});

interface ValidateRequest {
  csrf_token?: string;
  session_id?: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get session ID from cookie or body
    let sessionId: string | null = null;
    let csrfToken: string | null = null;

    console.log('[auth-validate] Request received');
    
    // Try to get session_id and csrf_token from request body first
    if (req.method === 'POST') {
      try {
        const body: ValidateRequest = await req.json();
        sessionId = body.session_id || null;
        csrfToken = body.csrf_token || null;
        console.log('[auth-validate] Body parsed:', { hasSessionId: !!sessionId, hasCsrf: !!csrfToken });
      } catch (e) {
        console.log('[auth-validate] Body parsing failed:', e);
        // If body parsing fails, continue to check cookies
      }
    }

    // Fallback to cookie if not in body
    if (!sessionId) {
      const cookieHeader = req.headers.get('cookie') || '';
      console.log('[auth-validate] Cookie header:', cookieHeader ? 'present' : 'missing');
      const sessionIdMatch = cookieHeader.match(/session_id=([^;]+)/);
      sessionId = sessionIdMatch ? sessionIdMatch[1] : null;
      console.log('[auth-validate] Session from cookie:', sessionId ? 'found' : 'not found');
    }

    // Fallback to header for CSRF token
    if (!csrfToken) {
      csrfToken = req.headers.get('x-csrf-token');
    }

    if (!sessionId) {
      console.log('[auth-validate] No session ID found');
      return new Response(
        JSON.stringify({ valid: false, error: 'No session found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[auth-validate] Validating session...');

    // Validate session
    const { data: validationResult, error: validationError } = await supabase.rpc(
      'validate_session',
      {
        _session_id: sessionId,
        _csrf_token: csrfToken,
      }
    );

    if (validationError) {
      console.error('Session validation error:', validationError);
      return new Response(
        JSON.stringify({ valid: false, error: 'Validation failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validationResult || validationResult.length === 0) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Invalid session' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = validationResult[0];

    if (!result.is_valid) {
      return new Response(
        JSON.stringify({ valid: false, error: 'Session expired or invalid' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Set session context for RLS
    await supabase.rpc('set_session_context', { _token_id: result.access_token_id });

    return new Response(
      JSON.stringify({
        valid: true,
        role: result.role,
        partner_id: result.partner_id,
        client_id: result.client_id,
        csrf_token: result.csrf_token,
        access_token_id: result.access_token_id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Validation error:', error);
    return new Response(
      JSON.stringify({
        valid: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
