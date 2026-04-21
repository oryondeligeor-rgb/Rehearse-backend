import OpenAI from 'openai';
import { ParsedScript } from '../script-parser';
import { buildChunks } from './serializer';
import { ExtractionOptions, ExtractionResult } from './types';

const DEFAULT_MODEL = process.env.OPENAI_SCRIPT_EXTRACTION_MODEL ?? 'gpt-4o-mini';

interface ChunkSceneResult {
  index: number;
  title: string;
}

interface ChunkExtractionResult {
  characters: string[];
  scenes: ChunkSceneResult[];
}

function buildSystemPrompt(): string {
  return [
    'You are extracting screenplay structure from a pre-parsed script.',
    'Return strict JSON with this shape:',
    '{"characters": string[], "scenes": [{"index": number, "title": string}]}.',
    'Rules:',
    '- Include only speaking characters.',
    '- Keep characters deduplicated and uppercase when appropriate.',
    '- Give every scene a descriptive title of 2 to 5 words.',
    '- Preserve the provided scene index for each scene.',
    '- Do not invent scenes that are not present in the input.',
    '- Return JSON only, no markdown.',
  ].join('\n');
}

function buildUserPrompt(chunkText: string): string {
  return [
    'Extract speaking characters and scene titles from this screenplay chunk.',
    'Each scene starts with a line like "SCENE <index>: <heading>".',
    'Return JSON only.',
    '',
    chunkText,
  ].join('\n');
}

function sanitizeTitle(title: string, fallbackHeading: string): string {
  const trimmed = title.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return fallbackHeading;
  }

  const words = trimmed.split(' ').slice(0, 5);
  return words.join(' ');
}

function parseChunkResponse(raw: string): ChunkExtractionResult {
  const parsed = JSON.parse(raw) as Partial<ChunkExtractionResult>;

  const characters = Array.isArray(parsed.characters)
    ? parsed.characters
        .filter((value): value is string => typeof value === 'string')
        .map(value => value.trim())
        .filter(Boolean)
    : [];

  const scenes = Array.isArray(parsed.scenes)
    ? parsed.scenes
        .filter((scene): scene is ChunkSceneResult => {
          return Boolean(
            scene &&
              typeof scene.index === 'number' &&
              Number.isInteger(scene.index) &&
              typeof scene.title === 'string',
          );
        })
        .map(scene => ({
          index: scene.index,
          title: scene.title.trim(),
        }))
    : [];

  return { characters, scenes };
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for AI script extraction.');
  }

  return new OpenAI({ apiKey });
}

export async function extractScriptInsights(
  script: ParsedScript,
  options: ExtractionOptions = {},
): Promise<ExtractionResult> {
  const client = getClient();
  const chunks = buildChunks(script);
  const characters = new Set<string>();
  const sceneTitles = new Map<number, string>();

  for (const chunk of chunks) {
    const response = await client.chat.completions.create({
      model: options.model ?? DEFAULT_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(chunk.text) },
      ],
    });

    const rawContent = response.choices[0]?.message?.content;

    if (!rawContent) {
      throw new Error('OpenAI returned an empty extraction response.');
    }

    const chunkResult = parseChunkResponse(rawContent);

    for (const character of chunkResult.characters) {
      characters.add(character);
    }

    for (const scene of chunkResult.scenes) {
      if (!chunk.sceneIndices.includes(scene.index)) {
        continue;
      }

      if (!sceneTitles.has(scene.index)) {
        const fallbackHeading =
          script.scenes.find(candidate => candidate.index === scene.index)?.heading ??
          `Scene ${scene.index + 1}`;

        sceneTitles.set(scene.index, sanitizeTitle(scene.title, fallbackHeading));
      }
    }
  }

  const scenes = script.scenes.map(scene => ({
    index: scene.index,
    heading: scene.heading,
    title:
      sceneTitles.get(scene.index) ??
      sanitizeTitle(scene.heading, `Scene ${scene.index + 1}`),
  }));

  return {
    characters: [...characters].sort(),
    scenes,
    chunksProcessed: chunks.length,
  };
}

export * from './serializer';
export * from './types';
