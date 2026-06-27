-- CreateEnum
CREATE TYPE "EnhancementStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "EnhancementJob" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "status" "EnhancementStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "originalImageUrl" TEXT NOT NULL,
    "enhancedImageUrl" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnhancementJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnhancementJob_pageId_idx" ON "EnhancementJob"("pageId");

-- CreateIndex
CREATE INDEX "EnhancementJob_status_idx" ON "EnhancementJob"("status");

-- AddForeignKey
ALTER TABLE "EnhancementJob" ADD CONSTRAINT "EnhancementJob_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
