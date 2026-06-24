-- CreateEnum
CREATE TYPE "OCRProvider" AS ENUM ('TESSERACT_CLI');

-- CreateEnum
CREATE TYPE "OCRImageRole" AS ENUM ('ORIGINAL', 'ENHANCED', 'CROPPED');

-- AlterEnum
ALTER TYPE "ProcessingStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "DocumentPage" ADD COLUMN "ocrLanguage" TEXT,
ADD COLUMN "ocrProvider" "OCRProvider",
ADD COLUMN "ocrLayout" JSONB,
ADD COLUMN "ocrTextLayer" JSONB,
ADD COLUMN "ocrSourceImageUrl" TEXT,
ADD COLUMN "ocrSourceImageRole" "OCRImageRole",
ADD COLUMN "ocrCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OCRJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "provider" "OCRProvider" NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "language" TEXT NOT NULL DEFAULT 'eng',
    "sourceImageUrl" TEXT NOT NULL,
    "sourceImageRole" "OCRImageRole" NOT NULL DEFAULT 'ORIGINAL',
    "extractedText" TEXT,
    "layout" JSONB,
    "textLayer" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OCRJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "OCRJob_documentId_idx" ON "OCRJob"("documentId");

-- CreateIndex
CREATE INDEX "OCRJob_pageId_idx" ON "OCRJob"("pageId");

-- CreateIndex
CREATE INDEX "OCRJob_status_idx" ON "OCRJob"("status");

-- AddForeignKey
ALTER TABLE "OCRJob" ADD CONSTRAINT "OCRJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OCRJob" ADD CONSTRAINT "OCRJob_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "DocumentPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
