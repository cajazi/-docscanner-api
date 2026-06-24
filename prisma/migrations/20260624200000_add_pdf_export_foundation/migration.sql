-- CreateEnum
CREATE TYPE "PdfExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "PdfExportJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "PdfExportStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'pdf-lib',
    "outputPdfUrl" TEXT,
    "pageCount" INTEGER,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PdfExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PdfExportJob_documentId_idx" ON "PdfExportJob"("documentId");

-- CreateIndex
CREATE INDEX "PdfExportJob_status_idx" ON "PdfExportJob"("status");

-- AddForeignKey
ALTER TABLE "PdfExportJob" ADD CONSTRAINT "PdfExportJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
