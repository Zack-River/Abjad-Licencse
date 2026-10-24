# License API Guide

Base URL: `https://your-license-api.example.com`

## Configure

Set these server-side environment variables before deploying:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
API_PORT=8787
LICENSE_ADMIN_PASSWORD=replace-with-a-long-random-password
```

Never expose the Supabase service-role key or admin password to the desktop app or browser. Apply every SQL migration in `supabase/migrations` before starting the API. Time-limited keys start when first successfully activated, not when created. The API stores a SHA-256 hash of each key; the plaintext key is returned only when created.

## Create a key

`POST /api/licenses/create` — JSON body; requires the exact `LICENSE_ADMIN_PASSWORD` configured on the server. Supported units are `hours`, `days`, `weeks`, and `months`; a month is 30 days. Duration must be a positive integer and cannot exceed 100 years. For a lifetime key, set `duration` to `lifetime` and omit `unit`.

Two-week request:

```json
{
  "password": "your-admin-password",
  "duration": 2,
  "unit": "weeks"
}
```

Lifetime request:

```json
{
  "password": "your-admin-password",
  "duration": "lifetime"
}
```

Example success response (`201`):

```json
{
  "created": true,
  "key": "AS-CUSTOM-...",
  "validityTime": "2 weeks",
  "creationDate": "2026-10-24T12:00:00.000Z",
  "useDate": null,
  "expirationDate": null
}
```

The expiration date is populated after the key's first successful activation. Keep the returned key secret; it cannot be retrieved from the database later.

Possible errors: `401 invalid_password`, `400 invalid_duration`, `503 admin_endpoint_disabled`, and `500 license_creation_unavailable`.

## Check a key

`GET /check` — accepts a `key` in a JSON or `multipart/form-data` request body.

```bash
curl -X GET 'https://your-license-api.example.com/check' \
  -H 'content-type: application/json' \
  -d '{"key":"AS-CUSTOM-..."}'
```

Example response:

```json
{
  "valid": true,
  "validityTime": "2 weeks",
  "remainingSeconds": 1209600,
  "creationDate": "2026-10-24T12:00:00.000Z",
  "useDate": null,
  "expirationDate": null
}
```

An unused time-limited key is valid and has no use or expiration date until activation. Invalid keys return `valid: false` with `reason: "invalid_key"`; revoked keys return `reason: "revoked"`.

## Validate and activate in the desktop app

`POST /api/licenses/validate` — binds the key to the first device identity that validates it and activates its timer.

```json
{
  "token": "AS-CUSTOM-...",
  "deviceId": "stable-installation-identity"
}
```

Success response includes `authorized: true` and license metadata. A key bound to a different device returns `409 device_bound`; invalid, expired, or revoked keys are rejected. Send a stable random installation identifier as `deviceId`; the API stores only its hash.
