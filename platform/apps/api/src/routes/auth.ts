/**
 * Auth Router — bcrypt + JWT.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate, hashPassword, verifyPassword, signToken, getUserById } from '../lib/auth.js';
import { db } from '../lib/db.js';
import { LoginSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';

export const authRouter = asyncHandler(async (req, res, url) => {
  const path = url.pathname;
  const method = req.method;

  if (path === '/auth/login' && method === 'POST') {
    const body = parseBody(LoginSchema, await readBody(req));
    const user = db.prepare(`SELECT * FROM users WHERE email = ? AND active = 1`).get(body.email) as any;
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      throw ApiError.unauthorized('Credenciais inválidas');
    }
    const token = signToken({ userId: user.id, role: user.role, email: user.email });
    return json(res, 200, {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: user.avatar },
    });
  }

  if (path === '/auth/me' && method === 'GET') {
    const user = await authenticate(req);
    if (!user) throw ApiError.unauthorized();
    const fresh = getUserById(user.id);
    return json(res, 200, { user: fresh });
  }

  if (path === '/auth/register' && method === 'POST') {
    const user = await authenticate(req);
    if (!user || user.role !== 'admin') throw ApiError.forbidden('Apenas admin');
    const body = await readBody(req);
    const id = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const hash = await hashPassword(body.password);
    db.prepare(`INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
      .run(id, body.email, body.name, hash, body.role || 'atendente');
    return json(res, 201, { id });
  }

  return json(res, 404, { error: 'Endpoint auth não encontrado' });
});
