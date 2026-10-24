alter table public.license_keys
  drop constraint if exists license_keys_license_type_check;

alter table public.license_keys
  add constraint license_keys_license_type_check
  check (license_type in ('trial_2h', 'trial_1w', 'trial_1m', 'lifetime'));

alter table public.license_keys
  drop constraint if exists trial_expiry_consistency;

alter table public.license_keys
  add constraint trial_expiry_consistency check (
    (license_type = 'lifetime' and expires_at is null)
    or (license_type in ('trial_2h', 'trial_1w', 'trial_1m'))
  );
