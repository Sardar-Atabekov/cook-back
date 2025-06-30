import { scrypt, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';

const scryptAsync = promisify(scrypt);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'; // .env

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${hash.toString('hex')}.${salt}`;
}

export async function comparePasswords(
  password: string,
  stored: string
): Promise<boolean> {
  const [hashed, salt] = stored.split('.');
  const hashBuf = Buffer.from(hashed, 'hex');
  const suppliedBuf = (await scryptAsync(password, salt, 64)) as Buffer;
  return timingSafeEqual(hashBuf, suppliedBuf);
}

export function generateToken(user: { id: string; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  });
}
