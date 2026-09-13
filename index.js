import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import { createClient } from '@supabase/supabase-js'

const PORT = Number(process.env.API_PORT || 8787)
const TRIAL_DURATION_MS = 2 * 60 * 60 * 1000

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const supabase = createClient(
  requiredEnv('SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
)

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

function hashDeviceId(deviceId) {
  return crypto.createHash('sha256').update(deviceId, 'utf8').digest('hex')
}

function createToken(type) {
  const prefix = type === 'trial_2h' ? 'AS-2H' : 'AS-LIFE'
  return `${prefix}-${crypto.randomBytes(18).toString('base64url').toUpperCase()}`
}

let seedPromise

async function seedLicenses() {
  const { count, error: countError } = await supabase
    .from('license_keys')
    .select('id', { count: 'exact', head: true })

  if (countError) throw new Error(`Unable to inspect license table: ${countError.message}`)
  if ((count || 0) > 0) return

  const generated = [
    ...Array.from({ length: 5 }, () => ({ type: 'trial_2h', token: createToken('trial_2h') })),
    ...Array.from({ length: 5 }, () => ({ type: 'lifetime', token: createToken('lifetime') }))
  ]

  const { error } = await supabase.from('license_keys').insert(
    generated.map(({ type, token }) => ({ token_hash: hashToken(token), license_type: type }))
  )
  if (error) throw new Error(`Unable to seed license keys: ${error.message}`)

  console.info('Generated initial license keys. Only hashes are stored in Supabase.')
  for (const item of generated) console.info(`${item.type}: ${item.token}`)
}

function ensureSeeded() {
  seedPromise ??= seedLicenses().catch((error) => {
    seedPromise = undefined
    throw error
  })
  return seedPromise
}

function unauthorized(reason) {
  return { authorized: false, reason }
}

async function activateTrial(row, now) {
  if (row.license_type !== 'trial_2h' || row.activated_at) return row

  const activatedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + TRIAL_DURATION_MS).toISOString()
  const { data, error } = await supabase
    .from('license_keys')
    .update({ activated_at: activatedAt, expires_at: expiresAt, last_validated_at: activatedAt })
    .eq('id', row.id)
    .is('activated_at', null)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Unable to activate license: ${error.message}`)
  if (data) return data

  const { data: current, error: reloadError } = await supabase
    .from('license_keys')
    .select('*')
    .eq('id', row.id)
    .single()
  if (reloadError) throw new Error(`Unable to reload license: ${reloadError.message}`)
  return current
}

async function bindDevice(row, deviceHash) {
  if (row.device_id_hash === deviceHash) return row
  if (row.device_id_hash) return null

  const { data, error } = await supabase
    .from('license_keys')
    .update({ device_id_hash: deviceHash })
    .eq('id', row.id)
    .is('device_id_hash', null)
    .select('*')
    .maybeSingle()

  if (error) throw new Error(`Unable to bind license: ${error.message}`)
  if (data) return data

  const { data: current, error: reloadError } = await supabase
    .from('license_keys')
    .select('*')
    .eq('id', row.id)
    .single()
  if (reloadError) throw new Error(`Unable to reload license: ${reloadError.message}`)
  return current.device_id_hash === deviceHash ? current : null
}

function validityResponse(row, now) {
  if (row.license_type === 'lifetime') {
    return {
      authorized: true,
      license: { type: 'lifetime', period: 'lifetime', expiresAt: null, remainingSeconds: null }
    }
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null
  const remainingSeconds = expiresAt
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000))
    : 0

  return {
    authorized: remainingSeconds > 0,
    license: {
      type: 'trial_2h',
      period: '2 hours',
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
      remainingSeconds
    }
  }
}

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '2kb' }))

app.get('/', (_request, response) => {
  response.json({ service: 'abjad-license-api', status: 'ok' })
})

app.use(async (_request, response, next) => {
  try {
    await ensureSeeded()
    next()
  } catch (error) {
    console.error('License API initialization failed:', error)
    response.status(500).json({ authorized: false, reason: 'service_unavailable' })
  }
})

app.post('/api/licenses/validate', async (request, response) => {
  const token = typeof request.body?.token === 'string' ? request.body.token.trim() : ''
  const deviceId = typeof request.body?.deviceId === 'string' ? request.body.deviceId.trim() : ''
  if (!token || token.length > 200 || !deviceId || deviceId.length > 200) {
    response.status(400).json(unauthorized('token_required'))
    return
  }

  try {
    const { data, error } = await supabase
      .from('license_keys')
      .select('*')
      .eq('token_hash', hashToken(token))
      .maybeSingle()

    if (error) throw new Error(`Unable to validate license: ${error.message}`)
    if (!data) {
      response.status(401).json(unauthorized('invalid_token'))
      return
    }
    if (data.revoked_at) {
      response.status(401).json(unauthorized('revoked'))
      return
    }

    const now = new Date()
    const boundRow = await bindDevice(data, hashDeviceId(deviceId))
    if (!boundRow) {
      response.status(409).json(unauthorized('device_bound'))
      return
    }
    const activeRow = await activateTrial(boundRow, now)
    const result = validityResponse(activeRow, now)

    await supabase
      .from('license_keys')
      .update({ last_validated_at: now.toISOString() })
      .eq('id', activeRow.id)

    response.status(result.authorized ? 200 : 401).json(result)
  } catch (error) {
    console.error('License validation failed:', error)
    response.status(500).json({ authorized: false, reason: 'validation_unavailable' })
  }
})

async function start() {
  await ensureSeeded()
  app.listen(PORT, () => console.info(`License API listening on http://localhost:${PORT}`))
}

if (process.env.VERCEL !== '1') {
  start().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

export default app
