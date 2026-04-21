-- CreateTable
CREATE TABLE "ScriptCharacter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scriptId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "ScriptCharacter_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScriptScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scriptId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "heading" TEXT NOT NULL,
    "title" TEXT,
    CONSTRAINT "ScriptScene_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScriptLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneId" TEXT NOT NULL,
    "lineIndex" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "character" TEXT,
    CONSTRAINT "ScriptLine_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "ScriptScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ScriptCharacter_scriptId_name_key" ON "ScriptCharacter"("scriptId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptScene_scriptId_index_key" ON "ScriptScene"("scriptId", "index");

-- CreateIndex
CREATE INDEX "ScriptLine_sceneId_idx" ON "ScriptLine"("sceneId");
