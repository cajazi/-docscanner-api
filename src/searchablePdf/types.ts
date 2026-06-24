export type NormalizedBoundingBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TextLayerWord = {
  text: string;
  confidence?: number;
  boundingBox?: NormalizedBoundingBox;
  rotation?: number;
};

export type TextLayerLine = {
  text: string;
  words: TextLayerWord[];
};

export type TextLayerBlock = {
  lines: TextLayerLine[];
};

export type TextLayerPage = {
  pageId: string;
  pageNumber: number;
  text: string;
  blocks: TextLayerBlock[];
  lines: TextLayerLine[];
  words: TextLayerWord[];
};

export type SearchablePdfTextLayer = {
  documentId: string;
  pages: TextLayerPage[];
  searchableText: string;
  pageCount: number;
};

export type SearchablePdfPageSource = {
  id: string;
  pageNumber: number;
  ocrText: string | null;
  ocrLayout: unknown;
  ocrTextLayer: unknown;
};

export type SearchablePdfDocumentSource = {
  id: string;
  pages: SearchablePdfPageSource[];
};

export interface SearchablePdfRepository {
  findDocumentWithOcrPages(documentId: string): Promise<SearchablePdfDocumentSource | null>;
  updateSearchablePdfMetadata(documentId: string, metadata: SearchablePdfTextLayer): Promise<void>;
}
