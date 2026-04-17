import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// PATCH /api/user/saved-scripts/:id
router.patch('/saved-scripts/:id', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const scriptId = req.params.id as string;
  const { saved } = req.body as { saved?: boolean };

  if (typeof saved !== 'boolean') {
    res.status(400).json({ message: 'saved (boolean) is required' });
    return;
  }

  const script = await prisma.script.findUnique({ where: { id: scriptId } });
  if (!script) {
    res.status(404).json({ message: 'Script not found' });
    return;
  }

  if (saved) {
    await prisma.savedScript.upsert({
      where: { userId_scriptId: { userId, scriptId } },
      create: { userId, scriptId },
      update: {},
    });
  } else {
    await prisma.savedScript.deleteMany({ where: { userId, scriptId } });
  }

  res.json({ saved });
});

export default router;
