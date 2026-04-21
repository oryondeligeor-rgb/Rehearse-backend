/**
 * Google Drive OAuth routes (post-MVP, behind GOOGLE_DRIVE_PICKER_ENABLED flag).
 *
 * Required env vars (only needed when GOOGLE_DRIVE_PICKER_ENABLED=true):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   GOOGLE_REDIRECT_URI  (e.g. https://your-api.com/api/google-drive/callback)
 *
 * All routes require a valid Bearer access token.
 */

import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';

const router = Router();

const GOOGLE_DRIVE_ENABLED =
  process.env.GOOGLE_DRIVE_PICKER_ENABLED === 'true';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? '';

const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function featureDisabled(res: Response): void {
  res.status(403).json({ message: 'Google Drive integration is not enabled.' });
}

// GET /api/google-drive/status
// Returns whether the current user has a connected Google Drive account.
router.get(
  '/status',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!GOOGLE_DRIVE_ENABLED) {
      res.json({ enabled: false, connected: false });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { googleDriveRefreshToken: true },
    });

    res.json({
      enabled: true,
      connected: Boolean(user?.googleDriveRefreshToken),
    });
  },
);

// GET /api/google-drive/authorize
// Returns the Google OAuth2 authorization URL. The client should open this URL
// in a WebView (native) or popup (web) and listen for the redirect to
// GOOGLE_REDIRECT_URI with a `code` query parameter.
router.get(
  '/authorize',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!GOOGLE_DRIVE_ENABLED) {
      featureDisabled(res);
      return;
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
      res.status(500).json({
        message:
          'Google Drive OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI.',
      });
      return;
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: GOOGLE_DRIVE_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      // Embed userId as state so the callback can associate the code with the
      // right user without requiring a session cookie.
      state: req.user!.userId,
    });

    res.json({ url: `${GOOGLE_AUTH_BASE}?${params.toString()}` });
  },
);

// POST /api/google-drive/callback
// Called by the client after it captures the `code` from the OAuth redirect.
// Exchanges the code for tokens and stores the refresh token on the user record.
router.post(
  '/callback',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!GOOGLE_DRIVE_ENABLED) {
      featureDisabled(res);
      return;
    }

    const { code } = req.body as { code?: string };

    if (typeof code !== 'string' || !code.trim()) {
      res.status(400).json({ message: 'code is required' });
      return;
    }

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      res.status(500).json({
        message: 'Google Drive OAuth credentials are not configured.',
      });
      return;
    }

    // Exchange the authorization code for tokens.
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('[google-drive] Token exchange failed:', errorBody);
      res.status(502).json({
        message: 'Failed to exchange authorization code with Google.',
      });
      return;
    }

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    if (!tokens.refresh_token) {
      res.status(422).json({
        message:
          'Google did not return a refresh token. Try revoking app access in Google Account settings and re-authorizing.',
      });
      return;
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { googleDriveRefreshToken: tokens.refresh_token },
    });

    res.json({ connected: true });
  },
);

// DELETE /api/google-drive/disconnect
// Removes the stored Google Drive refresh token from the user record.
router.delete(
  '/disconnect',
  requireAuth,
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!GOOGLE_DRIVE_ENABLED) {
      featureDisabled(res);
      return;
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { googleDriveRefreshToken: null },
    });

    res.json({ connected: false });
  },
);

export default router;
