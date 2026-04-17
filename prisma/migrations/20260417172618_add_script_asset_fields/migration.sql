-- AlterTable
ALTER TABLE "Script" ADD COLUMN "assetByteSize" INTEGER;
ALTER TABLE "Script" ADD COLUMN "assetFormat" TEXT;
ALTER TABLE "Script" ADD COLUMN "assetMimeType" TEXT;
ALTER TABLE "Script" ADD COLUMN "assetObjectKey" TEXT;
ALTER TABLE "Script" ADD COLUMN "assetSourceUrl" TEXT;
ALTER TABLE "Script" ADD COLUMN "assetUrl" TEXT;
ALTER TABLE "Script" ADD COLUMN "assetValidatedAt" DATETIME;
