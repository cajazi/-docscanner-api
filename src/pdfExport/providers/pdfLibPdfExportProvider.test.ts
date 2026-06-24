import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { ObjectStorage, StoredObject } from '../../storage/types';
import { ScanSourceRole } from '../../scanSource/types';
import { PdfLibPdfExportProvider } from './pdfLibPdfExportProvider';

class InMemoryObjectStorage implements ObjectStorage {
  written: Array<{ key: string; contentType: string; data: Buffer }> = [];

  constructor(private readonly imageBytes: Buffer) {}

  async read() {
    return this.imageBytes;
  }

  async write(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    this.written.push({ key, data, contentType });
    return {
      key,
      url: `memory://${key}`,
    };
  }
}

async function createImage() {
  return sharp({
    create: {
      width: 120,
      height: 160,
      channels: 3,
      background: '#ffffff',
    },
  })
    .jpeg()
    .toBuffer();
}

function baseInput(overrides: Partial<Parameters<PdfLibPdfExportProvider['export']>[0]> = {}) {
  return {
    documentId: 'doc_1',
    outputStorageKey: 'pdf-exports/doc_1/job_1.pdf',
    options: {
      searchable: false,
      pageSize: 'A4' as const,
      includeOcrTextLayer: false,
    },
    pages: [
      {
        pageId: 'page_1',
        pageNumber: 1,
        imageUrl: 'memory://page_1.jpg',
        sourceRole: ScanSourceRole.ENHANCED,
      },
    ],
    ...overrides,
  };
}

describe('PdfLibPdfExportProvider', () => {
  it('keeps image-only PDF behavior when text layer is not requested', async () => {
    const storage = new InMemoryObjectStorage(await createImage());
    const provider = new PdfLibPdfExportProvider(storage);

    const result = await provider.export(baseInput());

    expect(result.pageCount).toBe(1);
    expect(storage.written[0]?.contentType).toBe('application/pdf');
    expect(result.metadata).toMatchObject({
      searchablePdfImplemented: false,
      invisibleTextLayerImplemented: false,
      pagesWithTextLayer: 0,
      pages: [{ searchableTextLayerEmbedded: false }],
    });
  });

  it('renders invisible word text layer when OCR words have normalized boxes', async () => {
    const storage = new InMemoryObjectStorage(await createImage());
    const provider = new PdfLibPdfExportProvider(storage);

    const result = await provider.export(
      baseInput({
        options: {
          searchable: true,
          pageSize: 'A4',
          includeOcrTextLayer: true,
        },
        textLayer: {
          documentId: 'doc_1',
          searchableText: 'Hello world',
          pageCount: 1,
          pages: [
            {
              pageId: 'page_1',
              pageNumber: 1,
              text: 'Hello world',
              blocks: [],
              lines: [],
              words: [
                { text: 'Hello', boundingBox: { left: 0.1, top: 0.1, width: 0.2, height: 0.05 } },
                { text: 'world', boundingBox: { left: 0.35, top: 0.1, width: 0.2, height: 0.05 } },
              ],
            },
          ],
        },
      }),
    );

    expect(result.metadata).toMatchObject({
      searchablePdfImplemented: true,
      invisibleTextLayerImplemented: true,
      pagesWithTextLayer: 1,
      pagesWithoutTextLayer: 0,
      fallbackTextPlacement: false,
      pages: [{ searchableTextLayerEmbedded: true, fallbackTextPlacement: false }],
    });
  });

  it('uses fallback text placement when OCR word boxes are missing', async () => {
    const storage = new InMemoryObjectStorage(await createImage());
    const provider = new PdfLibPdfExportProvider(storage);

    const result = await provider.export(
      baseInput({
        options: {
          searchable: true,
          pageSize: 'A4',
          includeOcrTextLayer: true,
        },
        textLayer: {
          documentId: 'doc_1',
          searchableText: 'Fallback text',
          pageCount: 1,
          pages: [
            {
              pageId: 'page_1',
              pageNumber: 1,
              text: 'Fallback text',
              blocks: [],
              lines: [],
              words: [{ text: 'Fallback' }, { text: 'text' }],
            },
          ],
        },
      }),
    );

    expect(result.metadata).toMatchObject({
      searchablePdfImplemented: true,
      invisibleTextLayerImplemented: true,
      pagesWithTextLayer: 1,
      pagesWithoutTextLayer: 0,
      fallbackTextPlacement: true,
    });
  });

  it('reports pages without OCR text without failing export', async () => {
    const storage = new InMemoryObjectStorage(await createImage());
    const provider = new PdfLibPdfExportProvider(storage);

    const result = await provider.export(
      baseInput({
        options: {
          searchable: true,
          pageSize: 'A4',
          includeOcrTextLayer: true,
        },
        pages: [
          ...baseInput().pages,
          { pageId: 'page_2', pageNumber: 2, imageUrl: 'memory://page_2.jpg', sourceRole: ScanSourceRole.ORIGINAL },
        ],
        textLayer: {
          documentId: 'doc_1',
          searchableText: 'Only first page',
          pageCount: 2,
          pages: [
            {
              pageId: 'page_1',
              pageNumber: 1,
              text: 'Only first page',
              blocks: [],
              lines: [],
              words: [{ text: 'Only' }],
            },
            {
              pageId: 'page_2',
              pageNumber: 2,
              text: '',
              blocks: [],
              lines: [],
              words: [],
            },
          ],
        },
      }),
    );

    expect(result.metadata).toMatchObject({
      searchablePdfImplemented: true,
      invisibleTextLayerImplemented: true,
      pagesWithTextLayer: 1,
      pagesWithoutTextLayer: 1,
    });
  });
});
