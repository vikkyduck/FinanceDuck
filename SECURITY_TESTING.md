# Security Testing Guide

This document explains how to run automated security tests for the authentication system.

## Overview

The security test suite validates:
1. **HttpOnly Cookie Authentication** - Ensures session cookies are properly secured
2. **CSRF Protection** - Verifies CSRF tokens are generated and validated
3. **Session Expiration** - Tests session timeout and refresh mechanisms
4. **Security Headers** - Validates CORS and cookie security attributes

## Running Tests

### Method 1: Via Edge Function (Automated)

Call the `security-tests` edge function to run all tests:

```bash
curl -X POST https://kybbfizcpuyxkxqqfpzr.supabase.co/functions/v1/security-tests \
  -H "apikey: YOUR_ANON_KEY"
```

Or from JavaScript:

```javascript
const { data } = await supabase.functions.invoke('security-tests', {
  method: 'POST'
});
console.log(data);
```

### Method 2: Via UI (Recommended)

Add a "Run Security Tests" button to your admin dashboard:

```tsx
import { supabase } from "@/integrations/supabase/client";

const runSecurityTests = async () => {
  const { data, error } = await supabase.functions.invoke('security-tests', {
    method: 'POST'
  });
  
  if (error) {
    console.error('Tests failed:', error);
    return;
  }
  
  console.log('Test Results:', data);
};
```

## Test Suites

### 1. HttpOnly Cookie Authentication

**Tests:**
- ✓ Login sets httpOnly cookie with proper attributes
- ✓ Validate rejects requests without session cookie
- ✓ Cookie is httpOnly (not accessible via JavaScript)
- ✓ Logout clears session cookie

**What it validates:**
- Session cookies have `HttpOnly` flag (prevents JavaScript access)
- Session cookies have `Secure` flag in production (HTTPS only)
- Session cookies have `SameSite=Strict` (prevents CSRF)
- Unauthenticated requests are properly rejected
- Logout properly clears cookies

### 2. CSRF Protection

**Tests:**
- ✓ Login generates CSRF token
- ✓ Validate rejects invalid CSRF token
- ✓ Validate accepts valid CSRF token

**What it validates:**
- CSRF tokens are generated during login
- Requests with invalid CSRF tokens are rejected
- Requests with valid CSRF tokens are accepted
- CSRF tokens are properly validated against session

### 3. Session Expiration

**Tests:**
- ✓ Session has future expiration time
- ✓ Refresh extends session expiration
- ✓ Expired sessions are rejected

**What it validates:**
- New sessions have expiration timestamp (30 minutes default)
- Refresh endpoint extends expiration
- Expired sessions are rejected by validate endpoint
- Session cleanup occurs automatically

### 4. Security Headers

**Tests:**
- ✓ CORS configured for cookies
- ⚠ Cookies use SameSite=Strict (manual verification)
- ⚠ Cookies use Secure flag in production (manual verification)

**What it validates:**
- CORS headers allow credentials
- CORS headers allow cookie header
- Cookie security attributes are properly set

## Understanding Test Results

### Result Format

```json
{
  "total_suites": 4,
  "total_tests": 14,
  "total_passed": 12,
  "total_failed": 2,
  "duration": 1234,
  "results": [
    {
      "suite": "HttpOnly Cookie Authentication",
      "tests": [
        {
          "name": "Login sets httpOnly cookie",
          "passed": true,
          "message": "✓ Cookie set with HttpOnly and Secure",
          "duration": 45
        }
      ],
      "passed": 4,
      "failed": 0,
      "duration": 180
    }
  ]
}
```

### Status Indicators

- ✓ **Passed** - Test completed successfully
- ✗ **Failed** - Test did not pass, requires attention
- ⚠ **Manual** - Requires manual verification (not automated)

## Manual Verification Tests

Some security features require manual verification:

### 1. HttpOnly Cookie Access
Open browser console and run:
```javascript
console.log(document.cookie);
// Should NOT contain 'session_id'
```

### 2. Cookie Attributes in Production
Inspect Network tab > Response Headers > Set-Cookie:
```
session_id=xxx; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800
```

Verify:
- ✓ `HttpOnly` is present
- ✓ `Secure` is present (production only)
- ✓ `SameSite=Strict` is present

### 3. Session Expiration Warning
After 25 minutes of inactivity:
- ✓ Warning toast appears
- ✓ Session expires after 30 minutes
- ✓ User redirected to login

## Troubleshooting

### Test Failures

**"Login sets httpOnly cookie" fails:**
- Check auth-login edge function is deployed
- Verify cookie settings in edge function
- Check browser console for cookie errors

**"Validate rejects invalid CSRF" fails:**
- Check validate_session database function
- Verify CSRF token validation logic
- Review auth-validate edge function logs

**"Expired sessions are rejected" fails:**
- Check validate_session checks expiration
- Verify cleanup_expired_sessions cron job
- Check system clock is correct

### Common Issues

1. **Cookies not being set:**
   - Verify CORS headers include `Access-Control-Allow-Credentials: true`
   - Check browser is not blocking third-party cookies
   - Ensure domain matches (localhost vs 127.0.0.1)

2. **CSRF validation failing:**
   - Verify CSRF token is passed in request body or header
   - Check database stores CSRF token correctly
   - Ensure token comparison is case-sensitive

3. **Session not expiring:**
   - Check expires_at is set correctly in database
   - Verify validate_session checks expiration
   - Confirm cleanup job is running

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Security Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Security Tests
        run: |
          RESULT=$(curl -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/security-tests" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}")
          
          FAILED=$(echo $RESULT | jq '.total_failed')
          
          if [ "$FAILED" -gt "0" ]; then
            echo "Security tests failed!"
            echo $RESULT | jq '.'
            exit 1
          fi
          
          echo "All security tests passed!"
```

## Best Practices

1. **Run tests regularly:**
   - On every deployment
   - After authentication changes
   - Weekly automated runs

2. **Monitor test results:**
   - Set up alerts for failures
   - Track test duration trends
   - Review manual checks quarterly

3. **Update tests when:**
   - Adding new auth features
   - Changing session management
   - Modifying security headers

4. **Security audit checklist:**
   - [ ] All automated tests passing
   - [ ] Manual verifications completed
   - [ ] No security warnings in logs
   - [ ] Session expiration working
   - [ ] CSRF protection active
   - [ ] Cookies properly secured

## Related Documentation

- [Security Guidelines](./SECURITY.md)
- [Lovable Security Features](https://docs.lovable.dev/features/security)

## Support

If tests fail or you need help:
1. Check edge function logs in Lovable Cloud dashboard
2. Review database logs for RPC errors
3. Inspect browser network tab for cookie issues
4. Contact support with test results and logs
