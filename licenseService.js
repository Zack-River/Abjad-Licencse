import crypto from 'node:crypto'

export const LICENSE_TYPES = {
  trial_2h: { prefix: 'AS-2H', durationMs: 2 * 60 * 60 * 1000, period: '2 hours' },
  trial_1w: { prefix: 'AS-1W', durationMs: 7 * 24 * 60 * 60 * 1000, period: '1 week' },
  trial_1m: { prefix: 'AS-1M', durationMs: 30 * 24 * 60 * 60 * 1000, period: '1 month' },
  custom: { prefix: 'AS-CUSTOM', durationMs: null, period: 'custom' },
  lifetime: { prefix: 'AS-LIFE', durationMs: null, period: 'lifetime' }
}

export function getLicenseDuration(row) {
  if (row.license_type === 'custom') {
    const durationMs = Number(row.duration_seconds) * 1000
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
      throw new Error('Custom license has an invalid duration')
    }
    const units = [['month', 30 * 24 * 60 * 60], ['week', 7 * 24 * 60 * 60], ['day', 24 * 60 * 60], ['hour', 60 * 60]]
    const matchingUnit = units.find(([, seconds]) => row.duration_seconds % seconds === 0)
    const value = matchingUnit ? row.duration_seconds / matchingUnit[1] : row.duration_seconds
    const unit = matchingUnit?.[0] || 'second'
    return { durationMs, period: `${value} ${unit}${value === 1 ? '' : 's'}` }
  }
  return LICENSE_TYPES[row.license_type]
}

export function formatDuration(duration, unit) {
  const multipliers = {
    hour: 60 * 60,
    day: 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    month: 30 * 24 * 60 * 60
  }
  const normalizedUnit = typeof unit === 'string' ? unit.toLowerCase().replace(/s$/, '') : ''
  if (!Number.isSafeInteger(duration) || duration <= 0 || !multipliers[normalizedUnit]) {
    throw new TypeError('duration must be a positive integer and unit must be hour, day, week, or month')
  }
  const durationSeconds = duration * multipliers[normalizedUnit]
  if (!Number.isSafeInteger(durationSeconds) || durationSeconds > 100 * 365 * 24 * 60 * 60) {
    throw new RangeError('Duration must not exceed 100 years')
  }
  return { durationSeconds, durationMs: durationSeconds * 1000, period: `${duration} ${normalizedUnit}${duration === 1 ? '' : 's'}` }
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

export async function checkLicense(supabase, key, now = new Date()) {
  const { data: row, error } = await supabase
    .from('license_keys')
    .select('license_type, duration_seconds, issued_at, activated_at, expires_at, revoked_at')
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

  const license = getLicenseDuration(row)
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
