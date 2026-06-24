import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import type { ObjectStorage } from '../../storage/types';
import type { PdfExportProvider, PdfExportProviderInput, PdfExportProviderResult } from '../types';

const a4Portrait = {
  width: 595.28,
  height: 841.89,
};

export class PdfLibPdfExportProvider implements PdfExportProvider {
  readonly name = 'pdf-lib';

  constructor(private readonly storage: ObjectStorage) {}

  async export(input: PdfExportProviderInput): Promise<PdfExportProviderResult> {
    const pdf = await PDFDocument.create();
    const embeddedPages: Array<Record<string, unknown>> = [];

    for (const page of [...input.pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
      const imageBytes = await this.storage.read(page.imageUrl);
      const normalized = await normalizeImage(imageBytes);
      const image = await pdf.embedJpg(normalized.bytes);
      const pageSize = input.options.pageSize === 'AUTO'
        ? { width: image.width, height: image.height }
        : a4Portrait;
      const pdfPage = pdf.addPage([pageSize.width, pageSize.height]);
      const fitted = fitIntoBox(image.width, image.height, pageSize.width, pageSize.height);

      pdfPage.drawImage(image, {
        x: (pageSize.width - fitted.width) / 2,
        y: (pageSize.height - fitted.height) / 2,
        width: fitted.width,
        height: fitted.height,
      });

      embeddedPages.push({
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        sourceRole: page.sourceRole,
        imageFormat: normalized.format,
        searchableTextLayerEmbedded: false,
      });
    }

    const pdfBytes = Buffer.from(await pdf.save());
    const stored = await this.storage.write(input.outputStorageKey, pdfBytes, 'application/pdf');

    return {
      outputPdfUrl: stored.url,
      pageCount: input.pages.length,
      metadata: {
        provider: this.name,
        outputKey: stored.key,
        pageSize: input.options.pageSize,
        searchableRequested: input.options.searchable,
        includeOcrTextLayerRequested: input.options.includeOcrTextLayer,
        searchablePdfImplemented: false,
        pages: embeddedPages,
      },
    };
  }
}

async function normalizeImage(imageBytes: Buffer) {
  const metadata = await sharp(imageBytes, { failOn: 'none' }).metadata();
  return {
    bytes: await sharp(imageBytes, { failOn: 'none' }).rotate().jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    format: metadata.format,
  };
}

function fitIntoBox(sourceWidth: number, sourceHeight: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  return {
    width: sourceWidth * scale,
    height: sourceHeight * scale,
  };
}
