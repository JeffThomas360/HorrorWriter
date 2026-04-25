# Horror Writer Authentication System Design
**Date:** 2026-04-25  
**Status:** Approved  
**Scope:** Passkey + Magic Link authentication for SvelteKit backend

---

## Overview

The auth system enables users to sign up and sign in using:
1. **Passkeys** (face/fingerprint/device PIN) — primary method
2. **Magic links** (email with one-time token) — backup method

Both methods issue signed JWT tokens stored in httpOnly cookies for session management.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | SvelteKit + `@sveltejs/adapter-cloudflare` |
| Passkeys | `@simplewebauthn/server` + `@simplewebauthn/browser` |
| Magic Links | Resend (email delivery) |
| Sessions | Signed JWTs in httpOnly cookies |
| Database | Cloudflare D1 (SQLite) |

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);
```

### Passkeys Table
```sql
CREATE TABLE passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  credential_id BLOB NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT, -- JSON array (e.g., ["internal", "usb"])
  backed_up BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);
```

### Magic Links Table
```sql
CREATE TABLE magic_links (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  requested_ip TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## Authentication Flow

### Registration (Passkey-First)

**Step 1:** User provides email + desired username
- Check email/username uniqueness
- Generate 32-byte random challenge
- Return challenge + user ID to browser

**Step 2:** Browser initiates passkey creation
- Call `navigator.credentials.create()` with challenge
- User completes registration on device
- Send signed response back to server

**Step 3:** Server verifies passkey
- Verify signature using `verifyRegistrationResponse()`
- Store user + passkey in database
- Issue signed JWT cookie
- Redirect to app

### Sign-In (Passkey)

**Step 1:** User provides email/username or uses discoverable credentials
- Generate new 32-byte random challenge
- Return challenge to browser

**Step 2:** Browser retrieves passkey
- Call `navigator.credentials.get()` with challenge
- User completes authentication on device
- Send signed response to server

**Step 3:** Server verifies passkey
- Fetch user's stored passkey
- Verify signature using `verifyAuthenticationResponse()`
- **Verify signature counter increased** (prevents cloning)
- Update counter in database
- Issue signed JWT cookie

### Sign-In (Magic Link)

**Step 1:** User requests magic link
- Validate email exists or doesn't exist (no enumeration)
- Generate 256-bit random token
- Store token + expiry (10 minutes) + requesting IP
- Send email via Resend with signin link
- Rate limit: max 5 requests/hour per email, 20/hour per IP

**Step 2:** User clicks magic link
- Verify token exists + not expired + not used
- Fetch associated email/user
- Mark token as used
- Issue signed JWT cookie
- Redirect to app

---

## JWT Session Management

**JWT Structure:**
- **Header:** `{ alg: "HS256", typ: "JWT" }`
- **Payload:** `{ sub: user_id, email, username, iat, exp }`
- **Secret:** Cloudflare environment variable `JWT_SECRET`

**Cookie Settings:**
- httpOnly: true (inaccessible to JavaScript)
- Secure: true (HTTPS only)
- SameSite: Strict (CSRF protection)
- Max-Age: 3600 seconds (1 hour)

**Refresh Strategy:**
- Issue 1-hour JWT on signin
- Refresh JWT on every authenticated request if expiry < 15 min remaining
- On logout, clear cookie (no revocation list needed for stateless JWTs)

---

## Security Practices

### Passkey Security
- Store **credential counter** per passkey; verify it increases on each signin
- Support **resident/discoverable credentials** for username-less signin
- Require **user verification (UV)** flag during authentication
- Accept only `"required"` or `"preferred"` for user verification
- HTTPS enforced (WebAuthn non-negotiable)

### Magic Link Security
- Token: 256 bits of cryptographically random data
- Expiration: 10 minutes, single-use only
- Rate limiting: 5 per email/hour, 20 per IP/hour
- Optional: Link tokens to requesting IP for extra layer

### General
- No plaintext passwords ever
- All auth endpoints require HTTPS
- CSRF protection via SameSite cookies + form tokens on state-changing operations
- Audit all auth attempts (email sent, passkey signin, magic link used)

---

## API Routes

### Registration
- `POST /api/auth/register/begin` — Start passkey registration
  - Input: `{ email, username }`
  - Output: `{ challenge, userId, rp, user }`
  
- `POST /api/auth/register/complete` — Finish passkey registration
  - Input: passkey response + attestation
  - Output: 201 Created, JWT cookie set

### Passkey Sign-In
- `POST /api/auth/signin/passkey/begin` — Start passkey authentication
  - Input: `{ email }` or empty (for resident keys)
  - Output: `{ challenge, allowCredentials }`
  
- `POST /api/auth/signin/passkey/complete` — Finish passkey authentication
  - Input: passkey response
  - Output: 200 OK, JWT cookie set

### Magic Link Sign-In
- `POST /api/auth/signin/magic/request` — Send magic link email
  - Input: `{ email }`
  - Output: 204 No Content (no enumeration)
  
- `GET /api/auth/signin/magic/verify` — Verify magic link token
  - Query: `?token=xxx`
  - Output: 200 OK, JWT cookie set + redirect

### Session
- `POST /api/auth/logout` — Clear session
  - Output: 204 No Content, cookie cleared

---

## Error Handling

**400 Bad Request:**
- Invalid email/username format
- Email/username already exists
- Missing required fields

**401 Unauthorized:**
- Invalid passkey signature
- Counter not increasing (possible cloning attempt)
- Expired/used magic link
- Invalid JWT

**429 Too Many Requests:**
- Rate limit exceeded (magic link requests)

**500 Server Error:**
- Database failures
- Resend delivery failures (retry with exponential backoff)

---

## Testing Strategy

- **Unit tests:** JWT signing/verification, counter validation, token generation
- **Integration tests:** Full registration + signin flows (both methods)
- **Security tests:** Counter increment, single-use enforcement, rate limiting
- **E2E tests:** Browser-based passkey flow (requires authenticator simulation)

---

## Future Enhancements

- Device management (users view/revoke registered passkeys)
- Backup passkeys (multiple per user)
- WebAuthn conditional UI (autofill passkey selection)
- Account recovery via backup codes
- 2FA as additional layer (optional)
