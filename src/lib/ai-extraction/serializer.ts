import { ParsedScene, ParsedScript } from '../script-parser/types';

/**
 * Rough heuristic: OpenAI tokenises roughly 4 characters per token for English prose.
 * We use this to estimate chunk size without a full tokeniser dependency.
 */
const CHARS_PER_TOKEN = 4;

/** Maximum tokens we send in a single API call before chunking kicks in. */
export const MAX_CHUNK_TOKENS = 50_000;

/**
 * Overlap between consecutive chunks in tokens, so scenes near a boundary
 * are seen by both chunks and always get a title.
 */
export const OVERLAP_TOKENS = 5_000;

export const MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN; // 200 000 chars
export const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;      //  20 000 chars

/**
 * Converts one scene into a compact text block suitable for an LLM prompt.
 * Only dialogue-relevant line types are included to keep tokens low.
 */
export function serializeScene(scene: ParsedScene): string {
  const lines: string[] = [`SCENE ${scene.index}: ${scene.heading}`];

  for (const line of scene.lines) {
    switch (line.type) {
      case 'character':
        lines.push(`\n${line.text}`);
        break;
      case 'dialogue':
        lines.push(line.text);
        break;
      case 'parenthetical':
        lines.push(`(${line.text})`);
        break;
      case 'action':
        // Keep action lines but bracket them so the model doesn't confuse
        // them with dialogue.
        lines.push(`[${line.text}]`);
        break;
      default:
        break;
    }
  }

  return lines.join('\n');
}

export interface ScriptChunk {
  text: string;
  /** Scene indices included in this chunk (may overlap with adjacent chunks) */
  sceneIndices: number[];
}

/**
 * Splits a parsed script into one or more prompt-ready text chunks.
 *
 * For scripts under MAX_CHUNK_CHARS a single chunk is returned.
 * For larger scripts, chunks are split at scene boundaries with an
 * OVERLAP_CHARS tail carried into the next chunk so edge scenes are
 * always fully present in at least one call.
 */
export function buildChunks(script: ParsedScript): ScriptChunk[] {
  const sceneParts = script.scenes.map((scene) => ({
    text: serializeScene(scene),
    index: scene.index,
  }));

  const totalChars = sceneParts.reduce((sum, p) => sum + p.text.length + 8, 0);

  if (totalChars <= MAX_CHUNK_CHARS) {
    return [
      {
        text: sceneParts.map((p) => p.text).join('\n\n---\n\n'),
        sceneIndices: sceneParts.map((p) => p.index),
      },
    ];
  }

  const chunks: ScriptChunk[] = [];
  let currentParts: Array<{ text: string; index: number }> = [];
  let currentChars = 0;

  const flushChunk = () => {
    if (currentParts.length === 0) return;

    chunks.push({
      text: currentParts.map((p) => p.text).join('\n\n---\n\n'),
      sceneIndices: currentParts.map((p) => p.index),
    });

    // Carry an overlap tail into the next chunk.
    // Walk backwards collecting parts until we have >= OVERLAP_CHARS.
    const overlap: Array<{ text: string; index: number }> = [];
    let overlapLen = 0;
    for (let i = currentParts.length - 1; i >= 0; i--) {
      overlapLen += currentParts[i].text.length;
      overlap.unshift(currentParts[i]);
      if (overlapLen >= OVERLAP_CHARS) break;
    }

    currentParts = overlap;
    currentChars = overlapLen;
  };

  for (const part of sceneParts) {
    const partLen = part.text.length + 8; // +8 for the separator

    if (currentChars + partLen > MAX_CHUNK_CHARS && currentParts.length > 0) {
      flushChunk();
    }

    currentParts.push(part);
    currentChars += partLen;
  }

  // Final chunk
  if (currentParts.length > 0) {
    chunks.push({
      text: currentParts.map((p) => p.text).join('\n\n---\n\n'),
      sceneIndices: currentParts.map((p) => p.index),
    });
  }

  return chunks;
}
