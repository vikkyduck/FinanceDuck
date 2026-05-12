import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.1';

const getCorsHeaders = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin || 'https://99d5461e-ad68-4d98-ab03-7671a8370b23.lovableproject.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cookie',
  'Access-Control-Allow-Credentials': 'true',
});

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

    // Get session ID from body or cookie
    const body = await req.json().catch(() => ({}));
    let sessionId = body.session_id;

    // Fallback to cookie if not in body
    if (!sessionId) {
      const cookieHeader = req.headers.get('cookie') || '';
      const sessionIdMatch = cookieHeader.match(/session_id=([^;]+)/);
      sessionId = sessionIdMatch ? sessionIdMatch[1] : null;
    }

    if (!sessionId) {
      return new Response(
        JSON.stringify({ error: 'No session found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh the session
    const { data: expiresAt, error } = await supabase.rpc('refresh_session', {
      _session_id: sessionId,
    });

    if (error || !expiresAt) {
      console.error('Failed to refresh session:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to refresh session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the cookie with new expiration
    // Session cookie configured for cross-site usage with the app frontend
    const sessionCookie = `session_id=${sessionId}; Path=/; HttpOnly; Max-Age=${30 * 60}; SameSite=None; Secure`;

    return new Response(
      JSON.stringify({
        success: true,
        expires_at: expiresAt,
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
    console.error('Refresh error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
