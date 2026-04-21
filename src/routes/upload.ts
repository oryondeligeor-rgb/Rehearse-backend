import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../lib/prisma';
import { parseScript, SupportedScriptFormat } from '../lib/script-parser';
import { storeScriptData } from '../lib/script-store';

const router = Router();

// Keep uploaded files in memory — we parse and discard, nothing is written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

const FORMAT_BY_EXT: Record<string, SupportedScriptFormat> = {
  '.pdf': 'pdf',
  '.fdx': 'fdx',
  '.fountain': 'fountain',
  '.txt': 'txt',
};

function detectFormat(filename: string): SupportedScriptFormat | null {
  const ext = path.extname(filename).toLowerCase();
  return FORMAT_BY_EXT[ext] ?? null;
}

function deriveTitle(filename: string): string {
  const base = path.basename(filename, path.extname(filename));
  return base.replace(/[-_]+/g, ' ').trim() || 'Untitled';
}

async function createScriptRecord(
  title: string,
  author: string,
  pageCount: number,
  parsed: Awaited<ReturnType<typeof parseScript>>,
): Promise<{ scriptId: string; title: string; pageCount: number; characters: string[]; scenes: { id: string; index: number; heading: string; title: string | null }[] }> {
  const script = await prisma.script.create({
    data: {
      title,
      author,
      pageCount,
      sceneCount: parsed.scenes.length,
      thumbnailUrl: '',
      category: 'uploaded',
      genre: 'unknown',
      length: 'unknown',
      era: 'unknown',
      durationLabel: '',
      description: '',
      sceneId: '',
      sceneTitle: parsed.scenes[0]?.heading ?? '',
      previewText: '',
    },
  });

  await storeScriptData(script.id, parsed);

  const [characters, scenes] = await Promise.all([
    prisma.scriptCharacter.findMany({
      where: { scriptId: script.id },
      orderBy: { name: 'asc' },
      select: { name: true },
    }),
    prisma.scriptScene.findMany({
      where: { scriptId: script.id },
      orderBy: { index: 'asc' },
      select: { id: true, index: true, heading: true, title: true },
    }),
  ]);

  return {
    scriptId: script.id,
    title: script.title,
    pageCount: script.pageCount,
    characters: characters.map((c) => c.name),
    scenes,
  };
}

/**
 * POST /api/scripts/upload
 *
 * Accepts a single screenplay file (PDF, FDX, Fountain, TXT) via multipart
 * form-data under the field name "file".
 *
 * Returns:
 * {
 *   scriptId: string,
 *   title:    string,
 *   pageCount: number,
 *   characters: string[],
 *   scenes: { id: string, index: number, heading: string, title: string | null }[]
 * }
 */
router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ message: 'No file uploaded. Send a screenplay file in the "file" field.' });
    return;
  }

  const format = detectFormat(req.file.originalname);
  if (!format) {
    res.status(400).json({
      message: `Unsupported file type "${path.extname(req.file.originalname)}". Supported: .pdf, .fdx, .fountain, .txt`,
    });
    return;
  }

  // 1. Parse the script.
  let parsed;
  try {
    parsed = await parseScript(
      format === 'pdf'
        ? { format, buffer: req.file.buffer }
        : { format, content: req.file.buffer.toString('utf-8') },
    );
  } catch (err) {
    res.status(422).json({ message: `Failed to parse script: ${(err as Error).message}` });
    return;
  }

  const title = (req.body?.title as string | undefined)?.trim() || deriveTitle(req.file.originalname);
  const author = (req.body?.author as string | undefined)?.trim() || 'Unknown';
  const pageCount = parsed.pageCount ?? 0;

  let result;
  try {
    result = await createScriptRecord(title, author, pageCount, parsed);
  } catch (err) {
    res.status(500).json({ message: `Failed to save script: ${(err as Error).message}` });
    return;
  }

  res.status(201).json(result);
});

/**
 * POST /api/scripts/upload/text
 *
 * Accepts a plain-text screenplay in the JSON body.
 *
 * Body: { content: string, title?: string, author?: string, format?: "fountain"|"fdx"|"txt" }
 *
 * Returns the same shape as the file upload endpoint.
 */
router.post('/text', async (req: Request, res: Response): Promise<void> => {
  const { content, title: rawTitle, author: rawAuthor, format: rawFormat } = req.body ?? {};

  if (typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ message: 'Body must include a non-empty "content" string.' });
    return;
  }

  const format: SupportedScriptFormat = (['fountain', 'fdx', 'txt'].includes(rawFormat) ? rawFormat : 'txt') as SupportedScriptFormat;
  const title = (typeof rawTitle === 'string' ? rawTitle.trim() : '') || 'Untitled';
  const author = (typeof rawAuthor === 'string' ? rawAuthor.trim() : '') || 'Unknown';

  let parsed;
  try {
    parsed = await parseScript({ format, content });
  } catch (err) {
    res.status(422).json({ message: `Failed to parse script: ${(err as Error).message}` });
    return;
  }

  let result;
  try {
    result = await createScriptRecord(title, author, 0, parsed);
  } catch (err) {
    res.status(500).json({ message: `Failed to save script: ${(err as Error).message}` });
    return;
  }

  res.status(201).json(result);
});

export default router;
