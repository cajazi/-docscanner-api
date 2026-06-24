import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ObjectStorage } from '../../storage/types';
import type { PdfExportProvider, PdfExportProviderInput, PdfExportProviderResult } from '../types';
import type { TextLayerPage, TextLayerWord } from '../../searchablePdf/types';

const a4Portrait = {
  width: 595.28,
  height: 841.89,
};

export class PdfLibPdfExportProvider implements PdfExportProvider {
  readonly name = 'pdf-lib';

  constructor(private readonly storage: ObjectStorage) {}

  async export(input: PdfExportProviderInput): Promise<PdfExportProviderResult> {
    const pdf = await PDFDocument.create();
    const textLayerFont = await pdf.embedFont(StandardFonts.Helvetica);
    const embeddedPages: Array<Record<string, unknown>> = [];
    let pagesWithTextLayer = 0;
    let pagesWithoutTextLayer = 0;
    let fallbackTextPlacement = false;

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

      const textLayerPage = input.textLayer?.pages.find((candidate) => candidate.pageId === page.pageId);
      const textRenderResult = input.options.includeOcrTextLayer
        ? renderInvisibleTextLayer({
            pdfPage,
            textLayerPage,
            font: textLayerFont,
            imageFrame: {
              x: (pageSize.width - fitted.width) / 2,
              y: (pageSize.height - fitted.height) / 2,
              width: fitted.width,
              height: fitted.height,
            },
          })
        : { embedded: false, fallbackTextPlacement: false };

      if (textRenderResult.embedded) {
        pagesWithTextLayer += 1;
      } else {
        pagesWithoutTextLayer += 1;
      }

      fallbackTextPlacement ||= textRenderResult.fallbackTextPlacement;

      embeddedPages.push({
        pageId: page.pageId,
        pageNumber: page.pageNumber,
        sourceRole: page.sourceRole,
        imageFormat: normalized.format,
        searchableTextLayerEmbedded: textRenderResult.embedded,
        fallbackTextPlacement: textRenderResult.fallbackTextPlacement,
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
        searchablePdfImplemented: input.options.includeOcrTextLayer && pagesWithTextLayer > 0,
        invisibleTextLayerImplemented: input.options.includeOcrTextLayer && pagesWithTextLayer > 0,
        pagesWithTextLayer,
        pagesWithoutTextLayer,
        fallbackTextPlacement,
        pages: embeddedPages,
      },
    };
  }
}

type RenderInvisibleTextLayerInput = {
  pdfPage: PDFPage;
  textLayerPage: TextLayerPage | undefined;
  font: PDFFont;
  imageFrame: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

function renderInvisibleTextLayer(input: RenderInvisibleTextLayerInput) {
  const textLayerPage = input.textLayerPage;
  if (!textLayerPage || !textLayerPage.text.trim()) {
    return { embedded: false, fallbackTextPlacement: false };
  }

  const text = textLayerPage.text.trim();
  const wordsWithBoxes = textLayerPage.words.filter((word) => word.boundingBox);
  if (wordsWithBoxes.length > 0) {
    for (const word of wordsWithBoxes) {
      drawInvisibleWord(input.pdfPage, input.font, input.imageFrame, word);
    }

    return { embedded: true, fallbackTextPlacement: false };
  }

  drawInvisibleFallbackText(input.pdfPage, input.font, input.imageFrame, text);
  return { embedded: true, fallbackTextPlacement: true };
}

function drawInvisibleWord(
  pdfPage: PDFPage,
  font: PDFFont,
  imageFrame: RenderInvisibleTextLayerInput['imageFrame'],
  word: TextLayerWord,
) {
  if (!word.boundingBox) {
    return;
  }

  const fontSize = Math.max(1, word.boundingBox.height * imageFrame.height);
  pdfPage.drawText(word.text, {
    x: imageFrame.x + word.boundingBox.left * imageFrame.width,
    y: imageFrame.y + (1 - word.boundingBox.top - word.boundingBox.height) * imageFrame.height,
    size: fontSize,
    font,
    color: rgb(1, 1, 1),
    opacity: 0,
  });
}

function drawInvisibleFallbackText(
  pdfPage: PDFPage,
  font: PDFFont,
  imageFrame: RenderInvisibleTextLayerInput['imageFrame'],
  text: string,
) {
  pdfPage.drawText(text, {
    x: imageFrame.x + imageFrame.width * 0.03,
    y: imageFrame.y + imageFrame.height * 0.94,
    size: Math.max(8, imageFrame.height * 0.018),
    maxWidth: imageFrame.width * 0.94,
    lineHeight: Math.max(10, imageFrame.height * 0.022),
    font,
    color: rgb(1, 1, 1),
    opacity: 0,
  });
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
