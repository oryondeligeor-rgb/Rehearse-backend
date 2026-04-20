import { parseFdx } from './fdx';
import { parseFountain } from './fountain';
import { parsePdf } from './pdf';
import { ParsedScript } from './types';

export type SupportedScriptFormat = 'pdf' | 'fdx' | 'fountain' | 'txt';

export interface ParseScriptOptions {
  format: SupportedScriptFormat;
  buffer?: Buffer;
  content?: string;
}

function requireTextContent(content: string | undefined, format: string): string {
  if (typeof content === 'string') {
    return content;
  }

  throw new Error(`Text content is required to parse ${format} scripts.`);
}

function requireBuffer(buffer: Buffer | undefined): Buffer {
  if (buffer) {
    return buffer;
  }

  throw new Error('A file buffer is required to parse PDF scripts.');
}

export async function parseScript({
  format,
  buffer,
  content,
}: ParseScriptOptions): Promise<ParsedScript> {
  switch (format) {
    case 'pdf':
      return parsePdf(requireBuffer(buffer));
    case 'fdx':
      return parseFdx(requireTextContent(content, format));
    case 'fountain':
    case 'txt':
      return parseFountain(requireTextContent(content, format));
    default: {
      const unsupportedFormat: never = format;
      throw new Error(`Unsupported script format: ${unsupportedFormat}`);
    }
  }
}

export * from './types';
