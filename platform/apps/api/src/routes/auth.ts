/**
 * Auth Router — bcrypt + JWT + rate limiting.
 */
import { json, readBody } from '../lib/http.js';
import { authenticate, hashPassword, verifyPassword, signToken, getUserById } from '../lib/auth.js';
import { q, qe } from '../lib/db.js';
import { LoginSchema, ChangePasswordSchema, RegisterUserSchema, parseBody } from '../lib/validators.js';
import { ApiError, asyncHandler } from '../lib/errors.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { nanoid } from 'nanoid';

export const authRouter = asyncHandler(async (req, res, url) => {
  const path = url.pathname;
  const method = req.method;

  if (path === '/auth/login' && method === 'POST') {
    // Rate limit: 10 tentativas / 15 min por IP
    const rl = checkRateLimit(req, { windowMs: 15 * 60 * 1000, max: 10 });
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfter || 60));
      throw ApiError.tooManyRequests('Muitas tentativas. Tente novamente em alguns minutos.');
    }
    const body = parseBody(LoginSchema, await readBody(req));
    const user = (await q(`SELECT * FROM users WHERE email = $1 AND active = 1`, [body.email]))[0] as any;
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
    const fresh = await getUserById(user.id);
    return json(res, 200, { user: fresh });
  }

  // PUT /auth/me — altera nome e/ou e-mail do usuário logado
  if (path === '/auth/me' && method === 'PUT') {
    const user = await authenticate(req);
    if (!user) throw ApiError.unauthorized();
    const body = await readBody(req);
    if (typeof body !== 'object' || body === null) throw ApiError.validation('body inválido');
    const fields: string[] = [];
    const params: any[] = [];
    if (typeof body.name === 'string' && body.name.trim()) {
      fields.push(`name = $${params.length + 1}`); params.push(body.name.trim());
    }
    if (typeof body.email === 'string' && body.email.trim()) {
      const email = body.email.trim().toLowerCase();
      const dup = (await q(`SELECT id FROM users WHERE email = $1 AND id <> $2`, [email, user.id]))[0] as any;
      if (dup) throw ApiError.validation('E-mail já está em uso');
      fields.push(`email = $${params.length + 1}`); params.push(email);
    }
    if (!fields.length) return json(res, 200, { ok: true, user: await getUserById(user.id) });
    params.push(user.id);
    await qe(`UPDATE users SET ${fields.join(', ')} WHERE id = $${params.length}`, params);
    const fresh = await getUserById(user.id);
    // Renova o token para manter a sessão consistente
    const token = fresh ? signToken({ userId: fresh.id, role: fresh.role, email: fresh.email }) : undefined;
    return json(res, 200, { ok: true, user: fresh, token });
  }

  // PUT /auth/password — altera a própria senha (exige senha atual)
  if (path === '/auth/password' && method === 'PUT') {
    const user = await authenticate(req);
    if (!user) throw ApiError.unauthorized();
    const body = parseBody(ChangePasswordSchema, await readBody(req));
    const stored = (await q(`SELECT password_hash FROM users WHERE id = $1`, [user.id]))[0] as any;
    if (!stored || !(await verifyPassword(body.current_password, stored.password_hash))) {
      throw ApiError.unauthorized('Senha atual incorreta');
    }
    const hash = await hashPassword(body.new_password);
    await qe(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, user.id]);
    return json(res, 200, { ok: true, message: 'Senha atualizada com sucesso' });
  }

  if (path === '/auth/register' && method === 'POST') {
    const user = await authenticate(req);
    if (!user || user.role !== 'admin') throw ApiError.forbidden('Apenas admin');
    const body = parseBody(RegisterUserSchema, await readBody(req));
    const id = `usr_${nanoid(16)}`;
    const hash = await hashPassword(body.password);
    await qe(`INSERT INTO users (id, email, name, password_hash, role) VALUES ($1, $2, $3, $4, $5)`,
      [id, body.email, body.name, hash, body.role]);
    return json(res, 201, { id });
  }

  return json(res, 404, { error: 'Endpoint auth não encontrado' });
});
