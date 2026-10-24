alter table public.license_keys
  add column if not exists duration_seconds bigint;

alter table public.license_keys
  drop constraint if exists license_keys_license_type_check;

alter table public.license_keys
  add constraint license_keys_license_type_check
  check (license_type in ('trial_2h', 'trial_1w', 'trial_1m', 'lifetime', 'custom'));

alter table public.license_keys
  drop constraint if exists trial_expiry_consistency;

alter table public.license_keys
  add constraint trial_expiry_consistency check (
    (license_type = 'lifetime' and expires_at is null and duration_seconds is null)
    or (license_type in ('trial_2h', 'trial_1w', 'trial_1m') and duration_seconds is null)
    or (license_type = 'custom' and duration_seconds > 0)
  );
