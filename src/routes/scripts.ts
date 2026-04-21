import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { optionalAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/scripts
router.get('/', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { cursor, limit, q, genre, length, era } = req.query as Record<string, string | undefined>;

  const take = Math.min(parseInt(limit ?? '20', 10), 100);

  // Build filters
  const where: Prisma.ScriptWhereInput = {};

  if (q) {
    where.OR = [
      { title: { contains: q } },
      { author: { contains: q } },
      { description: { contains: q } },
      { sceneTitle: { contains: q } },
    ];
  }

  if (genre) {
    const genres = genre.split(',').map((g) => g.trim()).filter(Boolean);
    if (genres.length > 0) {
      where.genre = { in: genres };
    }
  }

  if (length) {
    const lengths = length.split(',').map((l) => l.trim()).filter(Boolean);
    if (lengths.length > 0) {
      where.length = { in: lengths };
    }
  }

  if (era) {
    const eras = era.split(',').map((e) => e.trim()).filter(Boolean);
    if (eras.length > 0) {
      where.era = { in: eras };
    }
  }

  // Cursor-based pagination
  const queryOptions: Prisma.ScriptFindManyArgs = {
    where,
    take: take + 1,
    orderBy: { createdAt: 'desc' },
  };

  if (cursor) {
    queryOptions.cursor = { id: cursor };
    queryOptions.skip = 1;
  }

  const scripts = await prisma.script.findMany(queryOptions);
  const hasMore = scripts.length > take;
  const data = hasMore ? scripts.slice(0, take) : scripts;
  const nextCursor = hasMore ? data[data.length - 1]?.id ?? null : null;

  // Attach isSaved for authenticated users
  let savedIds = new Set<string>();
  if (req.user) {
    const saved = await prisma.savedScript.findMany({
      where: { userId: req.user.userId, scriptId: { in: data.map((s) => s.id) } },
      select: { scriptId: true },
    });
    savedIds = new Set(saved.map((s) => s.scriptId));
  }

  res.json({
    data: data.map((s) => ({ ...s, isSaved: savedIds.has(s.id) })),
    nextCursor,
  });
});

// GET /api/scripts/trending
router.get('/trending', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const scripts = await prisma.script.findMany({
    orderBy: { trendingScore: 'desc' },
    take: 20,
  });

  let savedIds = new Set<string>();
  if (req.user) {
    const saved = await prisma.savedScript.findMany({
      where: { userId: req.user.userId, scriptId: { in: scripts.map((s) => s.id) } },
      select: { scriptId: true },
    });
    savedIds = new Set(saved.map((s) => s.scriptId));
  }

  res.json({ data: scripts.map((s) => ({ ...s, isSaved: savedIds.has(s.id) })) });
});

// GET /api/scripts/:scriptId
router.get('/:scriptId', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const scriptId = Array.isArray(req.params.scriptId)
    ? req.params.scriptId[0]
    : req.params.scriptId;

  if (!scriptId) {
    res.status(400).json({ message: 'scriptId is required' });
    return;
  }

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
  });

  if (!script) {
    res.status(404).json({ message: 'Script not found' });
    return;
  }

  const [characterCount, parsedSceneCount, isSaved] = await Promise.all([
    prisma.scriptCharacter.count({ where: { scriptId } }),
    prisma.scriptScene.count({ where: { scriptId } }),
    req.user
      ? prisma.savedScript.findUnique({
          where: {
            userId_scriptId: {
              userId: req.user.userId,
              scriptId,
            },
          },
        })
      : Promise.resolve(null),
  ]);

  res.json({
    ...script,
    isSaved: Boolean(isSaved),
    characterCount,
    sceneCount: parsedSceneCount || script.sceneCount,
  });
});

export default router;
