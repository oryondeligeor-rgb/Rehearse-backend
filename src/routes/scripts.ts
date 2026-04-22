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

// GET /api/scripts/:scriptId/characters/:characterName
router.get('/:scriptId/characters/:characterName', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const scriptId = Array.isArray(req.params.scriptId)
    ? req.params.scriptId[0]
    : req.params.scriptId;
  const characterName = Array.isArray(req.params.characterName)
    ? req.params.characterName[0]
    : req.params.characterName;

  if (!scriptId || !characterName) {
    res.status(400).json({ message: 'scriptId and characterName are required' });
    return;
  }

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    select: { id: true, title: true },
  });

  if (!script) {
    res.status(404).json({ message: 'Script not found' });
    return;
  }

  const scenes = await prisma.scriptScene.findMany({
    where: {
      scriptId,
      lines: {
        some: {
          type: 'dialogue',
          character: characterName,
        },
      },
    },
    orderBy: { index: 'asc' },
    select: {
      index: true,
      heading: true,
      title: true,
      lines: {
        where: {
          type: 'dialogue',
          character: characterName,
        },
        orderBy: { lineIndex: 'asc' },
        select: {
          text: true,
        },
      },
    },
  });

  if (!scenes.length) {
    res.status(404).json({ message: 'Character not found in this script' });
    return;
  }

  const previewLines = scenes
    .flatMap(scene =>
      scene.lines.map((line, index) => ({
        sceneIndex: scene.index + 1,
        sceneHeading: scene.title ?? scene.heading,
        lineIndex: index + 1,
        text: line.text,
      })),
    )
    .slice(0, 6);

  const lineCount = scenes.reduce(
    (total, scene) => total + scene.lines.length,
    0,
  );
  const firstAppearance = scenes[0];

  res.json({
    name: characterName,
    scriptTitle: script.title,
    lineCount,
    sceneCount: scenes.length,
    firstAppearance: {
      sceneIndex: firstAppearance.index + 1,
      sceneHeading: firstAppearance.title ?? firstAppearance.heading,
    },
    previewLines,
  });
});

// GET /api/scripts/:scriptId/characters
router.get('/:scriptId/characters', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const scriptId = Array.isArray(req.params.scriptId)
    ? req.params.scriptId[0]
    : req.params.scriptId;

  if (!scriptId) {
    res.status(400).json({ message: 'scriptId is required' });
    return;
  }

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    select: { id: true },
  });

  if (!script) {
    res.status(404).json({ message: 'Script not found' });
    return;
  }

  const [characters, scenes] = await Promise.all([
    prisma.scriptCharacter.findMany({
      where: { scriptId },
      orderBy: { name: 'asc' },
      select: { name: true },
    }),
    prisma.scriptScene.findMany({
      where: { scriptId },
      orderBy: { index: 'asc' },
      select: {
        lines: {
          where: {
            type: 'dialogue',
            character: { not: null },
          },
          select: {
            character: true,
          },
        },
      },
    }),
  ]);

  const lineCounts = new Map<string, number>();

  scenes.forEach(scene => {
    scene.lines.forEach(line => {
      if (!line.character) {
        return;
      }

      lineCounts.set(line.character, (lineCounts.get(line.character) ?? 0) + 1);
    });
  });

  const data = characters
    .map(character => ({
      name: character.name,
      lineCount: lineCounts.get(character.name) ?? 0,
    }))
    .sort((a, b) => b.lineCount - a.lineCount || a.name.localeCompare(b.name));

  res.json({ data });
});

// GET /api/scripts/:scriptId/reader
router.get('/:scriptId/reader', optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const scriptId = Array.isArray(req.params.scriptId)
    ? req.params.scriptId[0]
    : req.params.scriptId;

  if (!scriptId) {
    res.status(400).json({ message: 'scriptId is required' });
    return;
  }

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    select: { id: true, title: true, author: true },
  });

  if (!script) {
    res.status(404).json({ message: 'Script not found' });
    return;
  }

  const [characters, scenes] = await Promise.all([
    prisma.scriptCharacter.findMany({
      where: { scriptId },
      orderBy: { name: 'asc' },
      select: { name: true },
    }),
    prisma.scriptScene.findMany({
      where: { scriptId },
      orderBy: { index: 'asc' },
      select: {
        id: true,
        index: true,
        heading: true,
        title: true,
        lines: {
          orderBy: { lineIndex: 'asc' },
          select: {
            id: true,
            lineIndex: true,
            type: true,
            text: true,
            character: true,
          },
        },
      },
    }),
  ]);

  const fullText = scenes
    .flatMap(scene => {
      const sceneHeading = scene.title ?? scene.heading;
      const content = scene.lines.map(line => {
        if (line.character) {
          return `${line.character}\n${line.text}`;
        }

        return line.text;
      });

      return [sceneHeading, ...content].filter(Boolean);
    })
    .join('\n\n');

  const dialogue = scenes.flatMap(scene =>
    scene.lines
      .filter(line => line.type === 'dialogue' && line.character)
      .map(line => ({
        id: line.id,
        sceneIndex: scene.index + 1,
        sceneHeading: scene.title ?? scene.heading,
        speaker: line.character,
        text: line.text,
      })),
  );

  res.json({
    scriptId: script.id,
    title: script.title,
    author: script.author,
    characters: characters.map(character => character.name),
    fullText,
    dialogue,
    scenes: scenes.map(scene => ({
      id: scene.id,
      index: scene.index,
      heading: scene.heading,
      title: scene.title,
      lines: scene.lines,
    })),
  });
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
