import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateResetToken,
} from '../lib/jwt';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ message: 'name, email, and password are required' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ message: 'Email already registered' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  const payload = { userId: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });

  res.status(201).json({ accessToken, refreshToken });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ message: 'email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: 'Invalid credentials' });
    return;
  }

  const payload = { userId: user.id, email: user.email };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } });

  res.json({ accessToken, refreshToken });
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(400).json({ message: 'refreshToken is required' });
    return;
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
    return;
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored || stored.expiresAt < new Date()) {
    res.status(401).json({ message: 'Refresh token not found or expired' });
    return;
  }

  // Rotate: delete old, issue new
  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const newPayload = { userId: payload.userId, email: payload.email };
  const accessToken = signAccessToken(newPayload);
  const newRefreshToken = signRefreshToken(newPayload);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { token: newRefreshToken, userId: stored.userId, expiresAt },
  });

  res.json({ accessToken, refreshToken: newRefreshToken });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ message: 'email is required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Always respond 200 to avoid email enumeration
  if (user) {
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.passwordResetToken.create({ data: { token, userId: user.id, expiresAt } });
    // In production: send email with reset link containing token
    console.log(`[dev] Password reset token for ${email}: ${token}`);
  }

  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body;
  if (!token || !password) {
    res.status(400).json({ message: 'token and password are required' });
    return;
  }

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
    res.status(400).json({ message: 'Invalid or expired reset token' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { used: true } }),
    // Invalidate all refresh tokens on password reset
    prisma.refreshToken.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  res.json({ message: 'Password reset successfully' });
});

export default router;
