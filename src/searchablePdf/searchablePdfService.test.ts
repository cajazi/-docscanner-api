import { describe, expect, it } from 'vitest';
import { SearchablePdfService } from './searchablePdfService';
import type { SearchablePdfDocumentSource, SearchablePdfRepository, SearchablePdfTextLayer } from './types';

class InMemorySearchablePdfRepository implements SearchablePdfRepository {
  persisted: SearchablePdfTextLayer | null = null;

  constructor(private readonly document: SearchablePdfDocumentSource | null) {}

  async findDocumentWithOcrPages() {
    return this.document;
  }

  async updateSearchablePdfMetadata(_documentId: string, metadata: SearchablePdfTextLayer) {
    this.persisted = metadata;
  }
}

describe('SearchablePdfService', () => {
  it('builds and persists searchable PDF text layer metadata', async () => {
    const repository = new InMemorySearchablePdfRepository({
      id: 'doc_1',
      pages: [
        { id: 'page_1', pageNumber: 1, ocrText: 'Scanned text', ocrLayout: null, ocrTextLayer: null },
      ],
    });
    const service = new SearchablePdfService(repository);

    const layer = await service.buildTextLayer('doc_1');

    expect(layer).toMatchObject({
      documentId: 'doc_1',
      searchableText: 'Scanned text',
      pageCount: 1,
    });
    expect(repository.persisted).toBe(layer);
  });
});
