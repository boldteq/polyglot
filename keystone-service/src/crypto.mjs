// Field-level encryption for secrets at rest (client_secret, access_token, refresh_token).
// AES-256-GCM with a key from KEYSTONE_ENC_KEY (64 hex chars = 32 bytes). Node built-in crypto.
import crypto from 'node:crypto'

function key() {
  const hex = process.env.KEYSTONE_ENC_KEY || ''
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('KEYSTONE_ENC_KEY must be 64 hex chars (32 bytes). Generate: openssl rand -hex 32')
  }
  return Buffer.from(hex, 'hex')
}

// Returns "v1:<iv_b64>:<tag_b64>:<ct_b64>" — versioned so the scheme can evolve.
export function encrypt(plaintext) {
  if (plaintext == null) return null
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

export function decrypt(payload) {
  if (payload == null) return null
  const [v, ivb, tagb, ctb] = String(payload).split(':')
  if (v !== 'v1' || !ivb || !tagb || !ctb) throw new Error('bad ciphertext format')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivb, 'base64'))
  decipher.setAuthTag(Buffer.from(tagb, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctb, 'base64')), decipher.final()]).toString('utf8')
}

export function randomNonce() {
  return crypto.randomBytes(16).toString('hex')
}

// Constant-time compare for API-key auth + state checks.
export function safeEqual(a, b) {
  const ab = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}
