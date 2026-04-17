import 'dotenv/config';
import prisma from '../src/lib/prisma';
import provenanceData from './public_domain_scripts_provenance.json';

// ---------------------------------------------------------------------------
// Deterministic fallback helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Normalise "Last, First" → "First Last" for display */
function displayAuthor(raw: string): string {
  const parts = raw.split(',').map((p) => p.trim());
  if (parts.length === 2) return `${parts[1]} ${parts[0]}`;
  return raw;
}

/** Derive length bucket from page count */
function lengthLabel(pageCount: number): string {
  if (pageCount <= 70) return 'Short';
  if (pageCount <= 110) return 'Medium';
  return 'Long';
}

/** Estimate runtime: ~1 min per page on stage (industry rule of thumb) */
function durationLabel(pageCount: number): string {
  const totalMin = pageCount;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

/** Deterministic trending score in [50, 99] based on title hash */
function trendingScore(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) & 0xfffffff;
  }
  return 50 + (hash % 50);
}

/** Short description from metadata */
function description(title: string, author: string, genre: string, era: string): string {
  return `${title} is a ${era} ${genre.toLowerCase()} by ${author}. Text sourced from Project Gutenberg (public domain in the U.S.).`;
}

/** First scene id / title fallback */
function sceneId(title: string): string {
  return `${slugify(title)}-act1-sc1`;
}

function sceneTitle(sceneCount: number): string {
  return sceneCount > 1 ? 'Act 1, Scene 1' : 'Scene 1';
}

/** Very short preview text — generic opening stage direction */
function previewText(title: string, author: string): string {
  return `[Opening of ${title} by ${author}]\n[Stage direction: Scene opens.]\n`;
}

// ---------------------------------------------------------------------------
// Build seed records
// ---------------------------------------------------------------------------

const scripts = provenanceData.scripts.map((s) => {
  const author = displayAuthor(s.author);
  return {
    title: s.title,
    author,
    pageCount: s.pageCount,
    sceneCount: s.sceneCount,
    thumbnailUrl: `https://picsum.photos/seed/${slugify(s.title)}/300/400`,
    category: s.category,
    genre: s.genre,
    length: lengthLabel(s.pageCount),
    era: s.era,
    durationLabel: durationLabel(s.pageCount),
    description: description(s.title, author, s.genre, s.era),
    sceneId: sceneId(s.title),
    sceneTitle: sceneTitle(s.sceneCount),
    previewText: previewText(s.title, author),
    trendingScore: trendingScore(s.title),
    sourceName: s.sourceName,
    sourceUrl: s.sourceUrl,
    verificationNote: s.verificationNote,
  };
});

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding public-domain scripts from Project Gutenberg…');

  await prisma.script.deleteMany();

  for (const script of scripts) {
    await prisma.script.create({ data: script });
  }

  console.log(`Seeded ${scripts.length} verified public-domain scripts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
