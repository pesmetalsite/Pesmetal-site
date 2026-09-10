/**
 * Auth Service — bcrypt + JWT
 * Roles: admin, gestor, atendente
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { q, q1, qe } from './db.js';
import { nanoid } from 'nanoid';
import { logger } from './logger.js';

// JWT_SECRET obrigatório e ≥32 chars. Sem fallback hardcoded.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET deve ser definido e ter pelo menos 32 caracteres');
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const bcryptRoundsRaw = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
const BCRYPT_ROUNDS = Math.max(8, Math.min(Number.isFinite(bcryptRoundsRaw) ? bcryptRoundsRaw : 10, 14));

export type Role = 'admin' | 'gestor' | 'atendente';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatar: string | null;
  active: number;
  created_at: string;
}

export async function ensureAdminUser() {
  const exists = (await q1('SELECT COUNT(*)::int as c FROM users')) as { c: number };
  if (exists?.c === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@pesmetal.local';
    const password = process.env.ADMIN_PASSWORD || crypto.randomUUID().slice(0, 16);
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await qe(`
      INSERT INTO users (id, email, name, password_hash, role)
      VALUES ($1, $2, $3, $4, 'admin')
    `, [nanoid(), email, 'Administrador', hash]);
    // Log estruturado SEM dados sensíveis (sem email/password)
    logger.info('admin user ensured', { email_domain: email.split('@')[1] || 'local' });
    if (!process.env.ADMIN_PASSWORD) {
      logger.warn('admin password was auto-generated — set ADMIN_PASSWORD env var');
    }
  }
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: { userId: string; role: Role; email: string }) {
  return jwt.sign({ ...payload }, JWT_SECRET as jwt.Secret, { expiresIn: JWT_EXPIRES_IN as any });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET as jwt.Secret) as unknown as { userId: string; role: Role; email: string; iat: number; exp: number };
  } catch {
    return null;
  }
}

export async function getUserById(id: string): Promise<User | null> {
  const row = (await q1('SELECT id, email, name, role, avatar, active, created_at FROM users WHERE id = $1', [id])) as User | undefined;
  return row || null;
}

export async function getUserByEmail(email: string) {
  return (await q1('SELECT * FROM users WHERE email = $1', [email])) as (User & { password_hash: string }) | undefined;
}

export function requireRole(role: Role, userRole: Role) {
  const levels: Record<Role, number> = { atendente: 1, gestor: 2, admin: 3 };
  return levels[userRole] >= levels[role];
}

export async function authenticate(req: any): Promise<User | null> {
  const header = req?.headers?.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) return null;
  const user = await getUserById(decoded.userId);
  if (!user || !user.active) return null;
  return user;
}

export function authMiddleware(requiredRoles: Role[] = []) {
  return async (req: any, res: any, next: any) => {
    const user = await authenticate(req);
    if (!user) return res.writeHead(401) && res.end(JSON.stringify({ error: 'Não autenticado' }));
    if (requiredRoles.length && !requiredRoles.includes(user.role)) {
      return res.writeHead(403) && res.end(JSON.stringify({ error: 'Sem permissão' }));
    }
    req.user = user;
    next();
  };
}
