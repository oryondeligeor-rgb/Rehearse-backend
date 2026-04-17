-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Script" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "sceneCount" INTEGER NOT NULL DEFAULT 1,
    "thumbnailUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "length" TEXT NOT NULL,
    "era" TEXT NOT NULL,
    "durationLabel" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "sceneTitle" TEXT NOT NULL,
    "previewText" TEXT NOT NULL,
    "trendingScore" REAL NOT NULL DEFAULT 0,
    "sourceName" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "verificationNote" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Script" ("author", "category", "createdAt", "description", "durationLabel", "era", "genre", "id", "length", "pageCount", "previewText", "sceneId", "sceneTitle", "thumbnailUrl", "title", "trendingScore") SELECT "author", "category", "createdAt", "description", "durationLabel", "era", "genre", "id", "length", "pageCount", "previewText", "sceneId", "sceneTitle", "thumbnailUrl", "title", "trendingScore" FROM "Script";
DROP TABLE "Script";
ALTER TABLE "new_Script" RENAME TO "Script";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
