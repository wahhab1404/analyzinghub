/**
 * Symmetric encryption for stored X (Twitter) OAuth tokens.
 *
 * Access/refresh tokens grant the ability to post as an analyst, so they are
 * never persisted in plaintext. We use AES-256-GCM (authenticated encryption)
 * with a key derived from TWITTER_TOKEN_ENC_KEY.
 *
 * Stored format: "<iv>.<authTag>.<ciphertext>" (each part base64).
 */

import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard nonce size

function getKey(): Buffer {
  const raw = process.env.TWITTER_TOKEN_ENC_KEY
  if (!raw) {
    throw new Error('TWITTER_TOKEN_ENC_KEY is not configured')
  }
  // Accept any-length secret: derive a stable 32-byte key via SHA-256.
  return crypto.createHash('sha256').update(raw, 'utf8').digest()
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join('.')
}

export function decryptToken(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split('.')
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted token')
  }
  const iv = Buffer.from(ivB64, 'base64')
  const authTag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
