# Arabic Stroke License API

Standalone Express/Supabase service. It exposes only:

```text
POST /api/licenses/validate
```

## Deploy

1. Apply `supabase/migrations/20260913000000_create_license_keys.sql` to Supabase.
2. Copy `.env.example` to `.env` and set the Supabase URL and server-only service-role key.
3. Install and start:

```bash
npm install
npm start
```

On first startup with an empty table, five two-hour keys and five lifetime keys are generated. Plaintext keys are printed once to the server console; only SHA-256 hashes are stored. Trial keys activate on first successful validation.

The Electron app should use the deployed API URL through `LICENSE_API_URL`. Never ship `SUPABASE_SERVICE_ROLE_KEY` in the Electron app.

Each license is bound to the first device installation that validates it. The client sends a random installation identity; the API stores only its SHA-256 hash. A later device receives `device_bound`.

Example:

```bash
curl -X POST https://your-license-api.example.com/api/licenses/validate \
  -H 'content-type: application/json' \
  -d '{"token":"AS-LIFE-...", "deviceId":"installation-identity"}'
```
