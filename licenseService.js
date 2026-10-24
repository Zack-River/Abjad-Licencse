import crypto from 'node:crypto'

export const LICENSE_TYPES = {
  trial_2h: { prefix: 'AS-2H', durationMs: 2 * 60 * 60 * 1000, period: '2 hours' },
  trial_1w: { prefix: 'AS-1W', durationMs: 7 * 24 * 60 * 60 * 1000, period: '1 week' },
  trial_1m: { prefix: 'AS-1M', durationMs: 30 * 24 * 60 * 60 * 1000, period: '1 month' },
  lifetime: { prefix: 'AS-LIFE', durationMs: null, period: 'lifetime' }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

export async function checkLicense(supabase, key, now = new Date()) {
  const { data: row, error } = await supabase
    .from('license_keys')
    .select('license_type, issued_at, activated_at, expires_at, revoked_at')
    .eq('token_hash', hashToken(key))
    .maybeSingle()

  if (error) throw new Error(`Unable to check license: ${error.message}`)
  if (!row) {
    return {
      valid: false,
      reason: 'invalid_key',
      validityTime: null,
      remainingSeconds: null,
      creationDate: null,
      useDate: null,
      expirationDate: null
    }
  }

  const license = LICENSE_TYPES[row.license_type]
  if (!license) throw new Error(`Unknown license type: ${row.license_type}`)

  const expirationDate = row.expires_at
  const remainingSeconds = license.durationMs === null
    ? null
    : expirationDate
      ? Math.max(0, Math.ceil((new Date(expirationDate).getTime() - now.getTime()) / 1000))
      : row.activated_at
        ? 0
        : Math.ceil(license.durationMs / 1000)
  const valid = !row.revoked_at && (remainingSeconds === null || remainingSeconds > 0)

  return {
    valid,
    ...(row.revoked_at ? { reason: 'revoked' } : {}),
    validityTime: license.period,
    remainingSeconds,
    creationDate: row.issued_at,
    useDate: row.activated_at,
    expirationDate
  }
}
