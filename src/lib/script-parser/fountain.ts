/**
 * Fountain screenplay format parser.
 * Spec: https://fountain.io/syntax
 *
 * Also used as a best-effort heuristic parser for plain-text screenplays
 * that follow common screenplay conventions without formal Fountain markup.
 */
import { ParsedLine, ParsedScript } from './types';
import { buildScript } from './utils';

// INT. / EXT. / INT./EXT. / I/E  + optional space + anything
const SCENE_HEADING_RE = /^(INT|EXT|INT\.\/EXT|INT\/EXT|I\/E)[\s.]/i;
// Forced scene heading: starts with a single dot (not ..)
const FORCED_SCENE_HEADING_RE = /^\.[^.]/;
// Character cue: all-caps, optional trailing parenthetical (V.O., O.S., etc.)
// Must be non-empty and not match common all-caps action words
const CHARACTER_RE = /^([A-Z][A-Z0-9 '.,-]+?)(\s*\(.*\))?\s*$/;
// Transitions: "FADE OUT." / "CUT TO:" / "DISSOLVE TO:" etc.
const TRANSITION_RE = /^(FADE (IN|OUT|TO)|CUT TO|DISSOLVE TO|SMASH CUT|MATCH CUT|JUMP CUT)[\s:.]*/i;
// Parenthetical line
const PARENTHETICAL_RE = /^\(.*\)$/;
// Centered text (action forced-centered with ">")
const CENTERED_RE = /^>.+<$/;
// Page break
const PAGE_BREAK_RE = /^={3,}$/;
// Boneyard / comment block delimiters
const BONEYARD_START = /\/\*/;
const BONEYARD_END = /\*\//;
// Section / synopsis lines (not rendered, used for structure)
const SECTION_RE = /^#{1,6}\s/;
const SYNOPSIS_RE = /^=/;

/**
 * Strip Fountain inline emphasis markers (* _ [[ ]]) from a string.
 */
function stripEmphasis(text: string): string {
  return text
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
    .replace(/\[\[.*?\]\]/g, '')
    .trim();
}

export function parseFountain(source: string): ParsedScript {
  const warnings: string[] = [];
  const rawLines = source.split(/\r?\n/);
  const lines: ParsedLine[] = [];

  let currentScene = -1;
  let currentCharacter: string | undefined;
  let inBoneyard = false;
  let inDialogueBlock = false;

  // Dual-dialogue tracking
  let lastLineWasCharacter = false;

  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const trimmed = raw.trim();

    // --- boneyard (block comment) ---
    if (inBoneyard) {
      if (BONEYARD_END.test(raw)) inBoneyard = false;
      continue;
    }
    if (BONEYARD_START.test(raw)) {
      inBoneyard = true;
      continue;
    }

    // --- skip empty lines (they delimit blocks) ---
    if (trimmed === '') {
      inDialogueBlock = false;
      lastLineWasCharacter = false;
      continue;
    }

    // --- skip page breaks, sections, synopses ---
    if (PAGE_BREAK_RE.test(trimmed) || SECTION_RE.test(raw) || SYNOPSIS_RE.test(trimmed)) {
      continue;
    }

    // --- scene heading ---
    const forcedScene = FORCED_SCENE_HEADING_RE.test(raw) && !trimmed.startsWith('..');
    const naturalScene = SCENE_HEADING_RE.test(trimmed);
    if (forcedScene || naturalScene) {
      const heading = forcedScene ? stripEmphasis(trimmed.slice(1)) : stripEmphasis(trimmed);
      currentScene++;
      currentCharacter = undefined;
      inDialogueBlock = false;
      lastLineWasCharacter = false;
      lines.push({ type: 'scene_heading', text: heading, sceneIndex: currentScene });
      continue;
    }

    // --- transition ---
    if (TRANSITION_RE.test(trimmed) || (trimmed.endsWith(':') && trimmed === trimmed.toUpperCase() && trimmed.length < 40)) {
      lines.push({ type: 'transition', text: stripEmphasis(trimmed), sceneIndex: Math.max(currentScene, 0) });
      inDialogueBlock = false;
      lastLineWasCharacter = false;
      continue;
    }

    // --- centered action ---
    if (CENTERED_RE.test(trimmed)) {
      lines.push({ type: 'action', text: stripEmphasis(trimmed.slice(1, -1)), sceneIndex: Math.max(currentScene, 0) });
      lastLineWasCharacter = false;
      continue;
    }

    // --- inside dialogue block: parenthetical or dialogue ---
    if (inDialogueBlock && currentCharacter) {
      if (PARENTHETICAL_RE.test(trimmed)) {
        lines.push({ type: 'parenthetical', text: trimmed, character: currentCharacter, sceneIndex: Math.max(currentScene, 0) });
        lastLineWasCharacter = false;
        continue;
      }
      // Regular dialogue
      lines.push({ type: 'dialogue', text: stripEmphasis(trimmed), character: currentCharacter, sceneIndex: Math.max(currentScene, 0) });
      lastLineWasCharacter = false;
      continue;
    }

    // --- character cue (must be on its own line, non-empty prev line) ---
    const prevNonEmpty = rawLines.slice(0, i).reverse().find((l) => l.trim() !== '');
    const prevIsEmpty = prevNonEmpty === undefined || rawLines[i - 1]?.trim() === '';

    if (prevIsEmpty && CHARACTER_RE.test(trimmed) && trimmed === trimmed.toUpperCase()) {
      // Dual-dialogue marker "^" — treat as another character cue
      const name = trimmed.replace(/\^$/, '').replace(/\s*\(.*\)\s*$/, '').trim();
      if (name.length > 0 && name.length < 60) {
        currentCharacter = name;
        inDialogueBlock = true;
        lastLineWasCharacter = true;
        lines.push({ type: 'character', text: trimmed, character: name, sceneIndex: Math.max(currentScene, 0) });
        continue;
      }
    }

    // --- action line ---
    lines.push({ type: 'action', text: stripEmphasis(trimmed), sceneIndex: Math.max(currentScene, 0) });
    lastLineWasCharacter = false;
    inDialogueBlock = false;
  }

  if (currentScene === -1 && lines.length > 0) {
    warnings.push('No scene headings found; all content placed in implicit scene 0.');
    // Retroactively set sceneIndex to 0 (already done via Math.max)
    currentScene = 0;
  }

  return buildScript(lines, Math.max(currentScene + 1, lines.length > 0 ? 1 : 0), warnings);
}
