/**
 * Auth Service — bcrypt + JWT
 * Roles: admin, gestor, atendente
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { nanoid } from 'nanoid';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10');

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
  const exists = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
  if (exists.c === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@pesmetal.local';
    const password = process.env.ADMIN_PASSWORD || 'pesmetal123';
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    db.prepare(`
      INSERT INTO users (id, email, name, password_hash, role)
      VALUES (?, ?, ?, ?, 'admin')
    `).run(nanoid(), email, 'Administrador', hash);
    console.log(`✓ Usuário admin criado: ${email} / ${password}`);
  }
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: { userId: string; role: Role; email: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; role: Role; email: string; iat: number; exp: number };
  } catch {
    return null;
  }
}

export function getUserById(id: string): User | null {
  const row = db.prepare('SELECT id, email, name, role, avatar, active, created_at FROM users WHERE id = ?').get(id) as User | undefined;
  return row || null;
}

export function getUserByEmail(email: string) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as (User & { password_hash: string }) | undefined;
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
  const user = getUserById(decoded.userId);
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
