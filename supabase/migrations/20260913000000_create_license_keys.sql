create table if not exists public.license_keys (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  license_type text not null check (license_type in ('trial_2h', 'lifetime')),
  issued_at timestamptz not null default timezone('utc', now()),
  activated_at timestamptz,
  expires_at timestamptz,
  last_validated_at timestamptz,
  revoked_at timestamptz,
  constraint trial_expiry_consistency check (
    (license_type = 'lifetime' and expires_at is null)
    or (license_type = 'trial_2h')
  )
);

comment on table public.license_keys is 'Server-only hashed license tokens for the Arabic Stroke desktop app.';

alter table public.license_keys enable row level security;
revoke all on table public.license_keys from anon, authenticated;
grant select, insert, update on table public.license_keys to service_role;
