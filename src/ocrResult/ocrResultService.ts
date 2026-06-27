import type { OCRPageResultRecord, OCRResultRepository, OCRResultResponse } from './types';

export type GetPageOCRResultInput = {
  documentId: string;
  pageId: string;
};

export class OCRResultError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export class OCRResultService {
  constructor(private readonly repository: OCRResultRepository) {}

  async getPageResult(input: GetPageOCRResultInput): Promise<OCRResultResponse> {
    const record = await this.repository.findPageResult(input.documentId, input.pageId);
    if (!record) {
      throw new OCRResultError('OCR_RESULT_NOT_FOUND', 'Document page was not found', 404);
    }

    return toOCRResultResponse(record);
  }
}

function toOCRResultResponse(record: OCRPageResultRecord): OCRResultResponse {
  const ocrText = record.ocrText?.trim() ? record.ocrText : '';
  const hasText = ocrText.length > 0;

  return {
    documentId: record.documentId,
    pageId: record.pageId,
    status: hasText ? 'COMPLETED' : 'EMPTY',
    ocrText,
    extractedText: ocrText,
    searchableText: record.searchableText ?? '',
    textLayer: record.textLayer ?? {},
    updatedAt: record.updatedAt,
  };
}
