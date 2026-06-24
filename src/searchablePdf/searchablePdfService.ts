import { buildSearchableTextLayer } from './textLayerBuilder';
import type { SearchablePdfRepository, SearchablePdfTextLayer } from './types';

export class SearchablePdfError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export class SearchablePdfService {
  constructor(private readonly repository: SearchablePdfRepository) {}

  async buildTextLayer(documentId: string): Promise<SearchablePdfTextLayer> {
    const document = await this.repository.findDocumentWithOcrPages(documentId);
    if (!document) {
      throw new SearchablePdfError('DOCUMENT_NOT_FOUND', 'Document was not found', 404);
    }

    const textLayer = buildSearchableTextLayer(document.id, document.pages);
    await this.repository.updateSearchablePdfMetadata(documentId, textLayer);

    return textLayer;
  }
}
