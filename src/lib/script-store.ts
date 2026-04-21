import prisma from './prisma';
import { ParsedScript } from './script-parser';
import { ExtractionResult } from './ai-extraction';

/**
 * Persists parsed script data to the normalized ScriptCharacter, ScriptScene,
 * and ScriptLine tables linked to the given script record.
 *
 * Idempotent: existing rows for the script are deleted and re-inserted so the
 * function can be called again after a re-parse or re-extraction without
 * leaving stale data behind.
 *
 * @param scriptId  The Script.id this data belongs to.
 * @param parsed    Output of parseScript() — scenes, lines, characters.
 * @param extracted Optional output of extractScriptInsights() — AI-generated
 *                  scene titles. If omitted, titles are left null.
 */
export async function storeScriptData(
  scriptId: string,
  parsed: ParsedScript,
  extracted?: ExtractionResult,
): Promise<void> {
  // Build a fast lookup from scene index → AI title (if extraction was run).
  const titleByIndex = new Map<number, string>();
  if (extracted) {
    for (const s of extracted.scenes) {
      titleByIndex.set(s.index, s.title);
    }
  }

  await prisma.$transaction(async (tx) => {
    // 1. Clear existing parsed data for this script (idempotency).
    //    ScriptLine rows cascade-delete when their ScriptScene is removed.
    await tx.scriptScene.deleteMany({ where: { scriptId } });
    await tx.scriptCharacter.deleteMany({ where: { scriptId } });

    // 2. Insert characters.
    if (parsed.characters.length > 0) {
      await tx.scriptCharacter.createMany({
        data: parsed.characters.map((name) => ({ scriptId, name })),
      });
    }

    // 3. Insert scenes and their lines sequentially so we have the scene IDs
    //    needed for the ScriptLine foreign key.
    for (const scene of parsed.scenes) {
      const createdScene = await tx.scriptScene.create({
        data: {
          scriptId,
          index: scene.index,
          heading: scene.heading,
          title: titleByIndex.get(scene.index) ?? null,
        },
      });

      if (scene.lines.length > 0) {
        await tx.scriptLine.createMany({
          data: scene.lines.map((line, lineIndex) => ({
            sceneId: createdScene.id,
            lineIndex,
            type: line.type,
            text: line.text,
            character: line.character ?? null,
          })),
        });
      }
    }
  });
}
