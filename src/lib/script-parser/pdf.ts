/**
 * PDF screenplay parser.
 *
 * Uses pdf-parse to extract raw text from the PDF, then applies Fountain-style
 * heuristics to identify screenplay structure. PDF screenplays don't encode
 * semantic block types, so this is inherently best-effort.
 *
 * Caveat: column-based or heavily formatted PDFs may produce garbled text.
 */
import { PDFParse } from 'pdf-parse';
import { parseFountain } from './fountain';
import { ParsedScript } from './types';

export async function parsePdf(buffer: Buffer): Promise<ParsedScript> {
  let text: string;
  let pageCount: number | undefined;
  let parser: PDFParse | null = null;

  try {
    parser = new PDFParse({ data: buffer });
    const data = await parser.getText();
    text = data.text;
    pageCount = typeof data.total === 'number' ? data.total : undefined;
  } catch (err) {
    return {
      scenes: [],
      characters: [],
      lines: [],
      warnings: [`PDF text extraction failed: ${(err as Error).message}`],
    };
  } finally {
    await parser?.destroy().catch(() => undefined);
  }

  const result = parseFountain(text);
  result.warnings.unshift('PDF parsed via text extraction; structure is best-effort.');
  result.pageCount = pageCount;
  return result;
}
