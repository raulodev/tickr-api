import { createHash, randomBytes } from 'node:crypto';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
export const REVOKED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Token opaco de 256 bits: solo existe en el cliente y, como hash, en la base de datos */
export const generateToken = () => randomBytes(32).toString('base64url');

/** SHA-256 basta para un token aleatorio de alta entropía (no hace falta un hash lento como con contraseñas) */
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
