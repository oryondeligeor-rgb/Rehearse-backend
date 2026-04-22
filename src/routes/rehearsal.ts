import { Router, Request, Response } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const router = Router();
const execFileAsync = promisify(execFile);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const AUDIO_EXT_BY_MIME: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/webm;codecs=opus': '.webm',
  'audio/mp4': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
};

function normalizeTranscript(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

router.post(
  '/transcribe',
  upload.single('audio'),
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ message: 'No audio file uploaded.' });
      return;
    }

    const whisperPath = process.env.WHISPER_PATH || 'whisper';
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const whisperModel = process.env.WHISPER_MODEL || 'tiny.en';

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rehearse-stt-'));
    const audioExt = AUDIO_EXT_BY_MIME[req.file.mimetype] ?? '.webm';
    const basename = crypto.randomUUID();
    const inputPath = path.join(tempDir, `${basename}${audioExt}`);
    const wavBaseName = `${basename}-normalized`;
    const wavPath = path.join(tempDir, `${wavBaseName}.wav`);
    const jsonPath = path.join(tempDir, `${wavBaseName}.json`);

    try {
      await fs.writeFile(inputPath, req.file.buffer);

      await execFileAsync(ffmpegPath, [
        '-y',
        '-i',
        inputPath,
        '-ac',
        '1',
        '-ar',
        '16000',
        wavPath,
      ]);

      await execFileAsync(whisperPath, [
        wavPath,
        '--model',
        whisperModel,
        '--language',
        'en',
        '--task',
        'transcribe',
        '--output_format',
        'json',
        '--output_dir',
        tempDir,
        '--fp16',
        'False',
        '--verbose',
        'False',
      ]);

      const raw = await fs.readFile(jsonPath, 'utf8');
      const payload = JSON.parse(raw) as { text?: string };
      const transcript = payload.text?.trim() ?? '';

      res.json({
        transcript,
        normalizedTranscript: normalizeTranscript(transcript),
      });
    } catch (error) {
      console.error('Failed to transcribe rehearsal audio', error);
      res.status(500).json({
        message:
          error instanceof Error
            ? error.message
            : 'Failed to transcribe rehearsal audio.',
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  },
);

export default router;
