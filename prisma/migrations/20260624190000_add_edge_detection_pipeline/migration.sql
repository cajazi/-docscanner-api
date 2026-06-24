-- CreateEnum
CREATE TYPE "EdgeDetectionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "DocumentPage" ADD COLUMN "croppedImageUrl" TEXT;

-- CreateTable
CREATE TABLE "EdgeDetectionJob" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "status" "EdgeDetectionStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'heuristic',
    "sourceImageUrl" TEXT NOT NULL,
    "croppedImageUrl" TEXT,
    "corners" JSONB,
    "confidence" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EdgeDetectionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EdgeDetectionJob_pageId_idx" ON "EdgeDetectionJob"("pageId");

-- CreateIndex
CREATE INDEX "EdgeDetectionJob_status_idx" ON "EdgeDetectionJob"("status");

-- AddForeignKey
ALTER TABLE "EdgeDetectionJob" ADD CONSTRAINT "EdgeDetectionJob_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
