import { describe, it, expect } from 'vitest';
import { hashPassword, comparePasswords, generateToken } from './auth';
import jwt from 'jsonwebtoken';

// === AUTH SERVICE COMBINED ===
describe('auth service', () => {
  it('should hash password and verify it correctly', async () => {
    const password = 'supersecret';
    const hash = await hashPassword(password);
    const isMatch = await comparePasswords(password, hash);
    expect(isMatch).toBe(true);
  });
});

// === PASSWORD HASHING ===
describe('hashPassword', () => {
  it('should hash and compare correctly', async () => {
    const password = 'mySecret';
    const hash = await hashPassword(password);
    expect(typeof hash).toBe('string');
    const result = await comparePasswords(password, hash);
    expect(result).toBe(true);
  });

  it('should not match incorrect password', async () => {
    const password = 'correct';
    const wrong = 'wrong';
    const hash = await hashPassword(password);
    const result = await comparePasswords(wrong, hash);
    expect(result).toBe(false);
  });

  it('should return false if stored value is tampered with', async () => {
    const password = 'securePass';
    const hashed = await hashPassword(password);
    const tampered = hashed.replace(/.$/, 'x');
    const result = await comparePasswords(password, tampered);
    expect(result).toBe(false);
  });
});

// === JWT ===
describe('generateToken', () => {
  it('should return a valid JWT with correct payload', () => {
    const user = { id: '123', email: 'a@b.c' };
    const token = generateToken(user);
    expect(typeof token).toBe('string');
    const decoded = jwt.decode(token) as any;
    expect(decoded.id).toBe(user.id);
    expect(decoded.email).toBe(user.email);
  });

  it('should include only id and email in payload', () => {
    const user = { id: '1', email: 'a@b.c', password: '123' };
    const token = generateToken(user);
    const payload = jwt.decode(token) as any;
    expect(payload).toMatchObject({ id: '1', email: 'a@b.c' });
    expect(payload.password).toBeUndefined();
  });
});
