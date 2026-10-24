# Arabic Stroke License API

Standalone Express/Supabase service. It exposes:

```text
POST /api/licenses/validate
GET /check
```

`GET /check` accepts JSON or `multipart/form-data` with a `key` property and returns whether the key is valid, its validity period, and its creation, first-use, and expiration dates.

```bash
curl -X GET https://your-license-api.example.com/check \
  -H 'content-type: application/json' \
  -d '{"key":"AS-1W-..."}'
```

## Deploy

1. Apply `supabase/migrations/20260913000000_create_license_keys.sql` to Supabase.
2. Copy `.env.example` to `.env` and set the Supabase URL and server-only service-role key.
3. Install and start:

```bash
npm install
npm start
```

At startup, the service ensures there are ten one-week keys and ten one-month keys, filling any shortfall. The one-month duration is 30 days. Plaintext keys are printed once when generated; only SHA-256 hashes are stored. Time-limited keys activate on first successful validation. Apply all migrations in `supabase/migrations` before starting the service.

The Electron app should use the deployed API URL through `LICENSE_API_URL`. Never ship `SUPABASE_SERVICE_ROLE_KEY` in the Electron app.

Each license is bound to the first device installation that validates it. The client sends a random installation identity; the API stores only its SHA-256 hash. A later device receives `device_bound`.

Example:

```bash
curl -X POST https://your-license-api.example.com/api/licenses/validate \
  -H 'content-type: application/json' \
  -d '{"token":"AS-LIFE-...", "deviceId":"installation-identity"}'
```
