import { ParsedLine, ParsedScene, ParsedScript } from './types';

/**
 * Given a flat list of ParsedLine objects (with sceneIndex already set),
 * assemble the final ParsedScript with deduplicated scenes and characters.
 */
export function buildScript(
  lines: ParsedLine[],
  sceneCount: number,
  warnings: string[],
): ParsedScript {
  // Build scene objects
  const scenes: ParsedScene[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const sceneLines = lines.filter((l) => l.sceneIndex === i);
    const headingLine = sceneLines.find((l) => l.type === 'scene_heading');
    scenes.push({
      index: i,
      heading: headingLine?.text ?? `Scene ${i + 1}`,
      lines: sceneLines,
    });
  }

  // Collect unique character names from character/dialogue/parenthetical lines
  const characterSet = new Set<string>();
  for (const line of lines) {
    if (line.character) characterSet.add(line.character);
  }
  const characters = [...characterSet].sort();

  return { scenes, characters, lines, warnings };
}
