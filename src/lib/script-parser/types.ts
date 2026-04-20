export type LineType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'lyrics'
  | 'other';

export interface ParsedLine {
  type: LineType;
  text: string;
  /** Populated for 'dialogue' and 'parenthetical' lines — the speaking character */
  character?: string;
  /** Zero-based index into ParsedScript.scenes */
  sceneIndex: number;
}

export interface ParsedScene {
  index: number;
  /** Raw scene heading text, e.g. "INT. COFFEE SHOP - DAY" */
  heading: string;
  /** Lines that belong to this scene (subset of ParsedScript.lines) */
  lines: ParsedLine[];
}

export interface ParsedScript {
  scenes: ParsedScene[];
  /** Unique character names found in the script, sorted A-Z */
  characters: string[];
  /** All lines in document order */
  lines: ParsedLine[];
  /** Non-fatal issues encountered during parsing */
  warnings: string[];
}
