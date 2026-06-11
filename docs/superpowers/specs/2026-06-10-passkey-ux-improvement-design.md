# Passkey UX Improvement — Design Spec
**Date:** 2026-06-10  
**Status:** Approved

---

## Problem

The site currently registers passkeys without specifying `authenticatorAttachment`, so the browser decides which authenticator to use. On Windows, this defaults to Windows Hello, creating a device-bound credential that only works on that machine. Users who want cross-device access via Bitwarden, 1Password, or iCloud Keychain have no clear path to register one — the only guidance is a "Cancel and hope Bitwarden appears" workaround in an accordion.

---

## Goal

1. Let users register both types of passkey — device-bound and synced — through clearly labeled actions.
2. Show existing passkeys with their type so users always know what they have.
3. Remove the workaround accordion entirely; the UI itself solves the problem.

---

## Terminology (aligned with FIDO Alliance / industry standard)

| Term | Meaning | Examples |
|---|---|---|
| **Synced passkey** | Credential stored in a cloud vault, works from any device | Bitwarden, 1Password, iCloud Keychain, Google Password Manager |
| **Device-bound passkey** | Credential tied to this machine only | Windows Hello, Touch ID, Face ID |

---

## Architecture

### DB — new column on `passkey_credentials`

```sql
ALTER TABLE passkey_credentials
  ADD COLUMN attachment text CHECK (attachment IN ('platform', 'cross-platform'));
```

Nullable so existing rows (pre-feature) aren't broken. Existing passkeys show as "Unknown type" in the UI.

### Edge Function — `webauthn-register-begin`

Accept an optional `attachment` field in the JSON request body (`'platform'` or `'cross-platform'`). Pass it to `authenticatorSelection.authenticatorAttachment` in `generateRegistrationOptions`. If absent/invalid, omit the field (preserves current behaviour as a safe fallback).

### Edge Function — `webauthn-register-complete`

Accept the same optional `attachment` field in the request body (client echoes what it sent to begin). Strip it before passing the attestation response to `verifyRegistrationResponse`. Write it to the `attachment` column on insert.

### `src/lib/passkey.js` — `registerPasskey(attachment?)`

Add an optional `attachment` parameter. Pass it to both `webauthn-register-begin` and `webauthn-register-complete`.

### `src/pages/Profile.jsx` — passkey section

**Replace** the single "Add a Passkey" button with two side-by-side buttons:

```
[▸ Add synced passkey]          [▸ Add device-bound passkey]
 Works on any device             This machine only
 Bitwarden · 1Password           Windows Hello · Touch ID
 iCloud Keychain
```

**Replace** the generic passkey list rows with labeled rows:

```
🔐 Synced passkey     Added Jun 5 · last used Jun 10    [✕ Remove]
🔑 Device-bound       Added Jun 1                        [✕ Remove]
```

**Remove** the Bitwarden setup accordion entirely — it's no longer needed.

---

## Data flow

```
User clicks "Add synced passkey"
  → registerPasskey('cross-platform')
    → POST webauthn-register-begin  { attachment: 'cross-platform' }
      → generateRegistrationOptions({ authenticatorAttachment: 'cross-platform' })
      → browser shows Bitwarden / 1Password / QR picker (NOT Windows Hello)
    → POST webauthn-register-complete { ...attestation, attachment: 'cross-platform' }
      → verifyRegistrationResponse(attestation)
      → INSERT passkey_credentials { ..., attachment: 'cross-platform' }
  → loadPasskeys() → list refreshes with type label
```

---

## UI labels

| `attachment` value | Icon | Label |
|---|---|---|
| `'cross-platform'` | 🔐 | Synced passkey |
| `'platform'` | 🔑 | Device-bound passkey |
| `null` (legacy) | 🔑 | Passkey |

---

## What's NOT changing

- Authentication flow (`webauthn-authenticate-begin/complete`) — no changes needed.
- `deletePasskey()` — unchanged.
- RLS policies on `passkey_credentials` — unchanged.
- Magic link and Google OAuth sign-in — unchanged.

---

## Out of scope (future work)

- Post-login enrollment prompt (auto-trigger after sign-in to boost registration rates — FIDO Alliance research shows 75% of enrollments come from this pattern).
- Passkey friendly names (user-editable labels like "Home Mac" or "Work Bitwarden").

---

## Files touched

| File | Change |
|---|---|
| `supabase/migrations/<timestamp>_passkey_attachment.sql` | ADD COLUMN attachment |
| `supabase/functions/webauthn-register-begin/index.ts` | Read attachment param, pass to authenticatorSelection |
| `supabase/functions/webauthn-register-complete/index.ts` | Read attachment param, store in insert |
| `src/lib/passkey.js` | Add attachment param to registerPasskey() |
| `src/pages/Profile.jsx` | Two buttons, labeled list, remove Bitwarden accordion |
