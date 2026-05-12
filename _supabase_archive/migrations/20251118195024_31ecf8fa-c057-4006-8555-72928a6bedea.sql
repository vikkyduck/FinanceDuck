-- Phase 1: Security Monitoring Database Schema

-- Create enum for event types
CREATE TYPE security_event_type AS ENUM (
  'login_success',
  'login_failure',
  'rate_limit_exceeded',
  'bulk_operation',
  'data_export',
  'admin_action',
  'suspicious_pattern',
  'account_locked',
  'account_unlocked'
);

-- Create enum for severity levels
CREATE TYPE security_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- Create enum for limit types
CREATE TYPE rate_limit_type AS ENUM ('api', 'form', 'search', 'login', 'export', 'bulk');

-- 1. Central security events table
CREATE TABLE public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type security_event_type NOT NULL,
  severity security_severity NOT NULL DEFAULT 'low',
  user_identifier TEXT,
  token_id UUID REFERENCES public.access_tokens(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES public.access_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_security_events_created_at ON public.security_events(created_at DESC);
CREATE INDEX idx_security_events_severity ON public.security_events(severity) WHERE NOT resolved;
CREATE INDEX idx_security_events_token_id ON public.security_events(token_id);
CREATE INDEX idx_security_events_user_identifier ON public.security_events(user_identifier);

-- 2. Login attempts tracking
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  token_id UUID REFERENCES public.access_tokens(id) ON DELETE SET NULL,
  ip_address TEXT,
  user_agent TEXT,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_login_attempts_created_at ON public.login_attempts(created_at DESC);
CREATE INDEX idx_login_attempts_access_code ON public.login_attempts(access_code, created_at DESC);
CREATE INDEX idx_login_attempts_success ON public.login_attempts(success, created_at DESC);

-- 3. Rate limit violations tracking
CREATE TABLE public.rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_identifier TEXT NOT NULL,
  limit_type rate_limit_type NOT NULL,
  violation_count INTEGER DEFAULT 1,
  last_violation_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_rate_limit_violations_user ON public.rate_limit_violations(user_identifier, limit_type);
CREATE INDEX idx_rate_limit_violations_blocked ON public.rate_limit_violations(blocked_until) WHERE blocked_until IS NOT NULL;

-- 4. Rate limit state table (for backend rate limiting)
CREATE TABLE public.rate_limit_state (
  user_identifier TEXT NOT NULL,
  limit_type rate_limit_type NOT NULL,
  request_count INTEGER DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  violation_count INTEGER DEFAULT 0,
  PRIMARY KEY (user_identifier, limit_type)
);

CREATE INDEX idx_rate_limit_state_blocked ON public.rate_limit_state(blocked_until) WHERE blocked_until IS NOT NULL;

-- Enable Row Level Security
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admins can view security tables
CREATE POLICY "Admins can view all security events"
  ON public.security_events FOR SELECT
  USING (is_admin(get_session_token_id()));

CREATE POLICY "Admins can update security events"
  ON public.security_events FOR UPDATE
  USING (is_admin(get_session_token_id()));

CREATE POLICY "Admins can view all login attempts"
  ON public.login_attempts FOR SELECT
  USING (is_admin(get_session_token_id()));

CREATE POLICY "Admins can view rate limit violations"
  ON public.rate_limit_violations FOR SELECT
  USING (is_admin(get_session_token_id()));

CREATE POLICY "Admins can view rate limit state"
  ON public.rate_limit_state FOR SELECT
  USING (is_admin(get_session_token_id()));

-- Enable realtime for security events (for dashboard)
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.login_attempts;