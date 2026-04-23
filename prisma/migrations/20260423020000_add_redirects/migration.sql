-- CreateEnum
CREATE TYPE "RedirectCode" AS ENUM ('PERMANENT', 'TEMPORARY');

-- CreateTable
CREATE TABLE "Redirect" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "code" "RedirectCode" NOT NULL DEFAULT 'PERMANENT',
    "source" TEXT,
    "note" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redirect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Redirect_fromPath_key" ON "Redirect"("fromPath");

-- CreateIndex
CREATE INDEX "Redirect_source_idx" ON "Redirect"("source");

-- CreateIndex
CREATE INDEX "Redirect_createdAt_idx" ON "Redirect"("createdAt");
