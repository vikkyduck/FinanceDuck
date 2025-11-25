import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const getCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || 'https://99d5461e-ad68-4d98-ab03-7671a8370b23.lovableproject.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Credentials': 'true',
});

interface LoginRequest {
  code: string;
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

    const { code }: LoginRequest = await req.json();

    if (!code || typeof code !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user agent and IP from request
    const userAgent = req.headers.get('user-agent') || null;
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                     req.headers.get('x-real-ip') || null;

    console.log('Login attempt:', { code: code.toUpperCase(), ipAddress, userAgent });

    // Verify access code using the RPC function
    const { data: verificationResult, error: verifyError } = await supabase.rpc(
      'verify_access_code',
      {
        _code: code.toUpperCase(),
        _ip_address: ipAddress,
        _user_agent: userAgent,
      }
    );

    if (verifyError) {
      console.error('Verification error:', verifyError);
      return new Response(
        JSON.stringify({ error: 'Verification failed', details: verifyError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!verificationResult || verificationResult.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid response from verification' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = verificationResult[0];

    // Check if account is locked
    if (token.is_locked) {
      const lockedUntil = new Date(token.locked_until);
      const minutesRemaining = Math.ceil((lockedUntil.getTime() - Date.now()) / 60000);

      return new Response(
        JSON.stringify({
          error: 'account_locked',
          message: `Слишком много неудачных попыток входа. Попробуйте снова через ${minutesRemaining} мин.`,
          locked_until: token.locked_until,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if code is valid
    if (!token.is_valid) {
      const attemptsRemaining = token.attempts_remaining || 0;
      return new Response(
        JSON.stringify({
          error: 'invalid_code',
          message: attemptsRemaining <= 2 && attemptsRemaining > 0
            ? `Осталось попыток: ${attemptsRemaining}`
            : 'Код доступа не найден или деактивирован',
          attempts_remaining: attemptsRemaining,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create session using the database function
    const { data: sessionData, error: sessionError } = await supabase.rpc(
      'create_session',
      {
        _access_token_id: token.token_id,
        _ip_address: ipAddress,
        _user_agent: userAgent,
      }
    );

    if (sessionError || !sessionData || sessionData.length === 0) {
      console.error('Session creation error:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create session', details: sessionError?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const session = sessionData[0];

    console.log('Session created successfully:', {
      sessionId: session.session_id.substring(0, 10) + '...',
      role: token.role,
    });

    // Set session context for this connection
    await supabase.rpc('set_session_context', { _token_id: token.token_id });

    // Create cookie header with secure attributes
    // Session cookie configured for cross-site usage with the app frontend
    const sessionCookie = `session_id=${session.session_id}; Path=/; HttpOnly; Max-Age=${30 * 60}; SameSite=None; Secure`;

    // Return success with Set-Cookie header
    return new Response(
      JSON.stringify({
        success: true,
        role: token.role,
        partner_id: token.partner_id,
        client_id: token.client_id,
        csrf_token: session.csrf_token,
        expires_at: session.expires_at,
        access_token_id: token.token_id,
        session_id: session.session_id,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Set-Cookie': sessionCookie,
        },
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
