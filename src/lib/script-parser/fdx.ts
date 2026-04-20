/**
 * Final Draft FDX format parser.
 * FDX is an XML format where <Paragraph Type="..."> elements hold screenplay blocks.
 * Supported types: Scene Heading, Action, Character, Dialogue, Parenthetical, Transition, Lyrics, General
 */
import { XMLParser } from 'fast-xml-parser';
import { LineType, ParsedLine, ParsedScript } from './types';
import { buildScript } from './utils';

interface FdxTextNode {
  '#text'?: string | number;
  AdornmentStyle?: string;
}

interface FdxParagraph {
  Type?: string;
  Text?: FdxTextNode | FdxTextNode[] | string;
}

interface FdxContent {
  Paragraph?: FdxParagraph | FdxParagraph[];
}

interface FdxScript {
  FinalDraft?: {
    Content?: FdxContent;
  };
}

const FDX_TYPE_MAP: Record<string, LineType> = {
  'Scene Heading': 'scene_heading',
  'Action': 'action',
  'Character': 'character',
  'Dialogue': 'dialogue',
  'Parenthetical': 'parenthetical',
  'Transition': 'transition',
  'Lyrics': 'lyrics',
  'General': 'other',
};

function extractText(textNode: FdxParagraph['Text']): string {
  if (!textNode) return '';
  if (typeof textNode === 'string') return textNode;
  if (Array.isArray(textNode)) {
    return textNode
      .map((t) => {
        if (typeof t === 'string') {
          return t;
        }

        return typeof t['#text'] === 'string' ? t['#text'] : String(t['#text'] ?? '');
      })
      .join('');
  }
  if (typeof textNode === 'object') {
    const t = (textNode as FdxTextNode)['#text'];
    return typeof t === 'string' ? t : String(t ?? '');
  }
  return '';
}

export function parseFdx(source: string): ParsedScript {
  const warnings: string[] = [];

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    textNodeName: '#text',
    isArray: (name) => name === 'Paragraph' || name === 'Text',
  });

  let doc: FdxScript;
  try {
    doc = parser.parse(source) as FdxScript;
  } catch (err) {
    warnings.push(`FDX XML parse error: ${(err as Error).message}`);
    return { scenes: [], characters: [], lines: [], warnings };
  }

  const rawParagraphs = doc?.FinalDraft?.Content?.Paragraph;
  const paragraphs: FdxParagraph[] = Array.isArray(rawParagraphs)
    ? rawParagraphs
    : rawParagraphs
      ? [rawParagraphs]
      : [];

  const lines: ParsedLine[] = [];
  let currentScene = -1;
  let currentCharacter: string | undefined;

  for (const para of paragraphs) {
    const fdxType = para.Type ?? 'General';
    const lineType: LineType = FDX_TYPE_MAP[fdxType] ?? 'other';
    const text = extractText(para.Text).trim();

    if (!text) continue;

    if (lineType === 'scene_heading') {
      currentScene++;
      currentCharacter = undefined;
      lines.push({ type: 'scene_heading', text, sceneIndex: currentScene });
    } else if (lineType === 'character') {
      currentCharacter = text.replace(/\s*\(.*\)\s*$/, '').trim();
      lines.push({ type: 'character', text, character: currentCharacter, sceneIndex: Math.max(currentScene, 0) });
    } else if (lineType === 'dialogue' || lineType === 'parenthetical') {
      lines.push({ type: lineType, text, character: currentCharacter, sceneIndex: Math.max(currentScene, 0) });
    } else {
      lines.push({ type: lineType, text, sceneIndex: Math.max(currentScene, 0) });
    }
  }

  if (currentScene === -1 && lines.length > 0) {
    warnings.push('No scene headings found in FDX; all content placed in implicit scene 0.');
    currentScene = 0;
  }

  return buildScript(lines, Math.max(currentScene + 1, lines.length > 0 ? 1 : 0), warnings);
}
