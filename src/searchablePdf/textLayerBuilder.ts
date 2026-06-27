import type {
  SearchablePdfPageSource,
  SearchablePdfTextLayer,
  TextLayerBlock,
  TextLayerLine,
  TextLayerPage,
  TextLayerWord,
} from './types';

export function buildSearchableTextLayer(documentId: string, pages: SearchablePdfPageSource[]): SearchablePdfTextLayer {
  const textLayerPages = [...pages]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => buildTextLayerPage(page));

  return {
    documentId,
    pages: textLayerPages,
    searchableText: textLayerPages
      .map((page) => page.text.trim())
      .filter(Boolean)
      .join('\n\n'),
    pageCount: textLayerPages.length,
  };
}

function buildTextLayerPage(page: SearchablePdfPageSource): TextLayerPage {
  const blocks = readBlocks(page.ocrLayout);
  const lines = blocks.flatMap((block) => block.lines);
  const words = lines.flatMap((line) => line.words);
  const text = page.ocrText?.trim() || lines.map((line) => line.text).join('\n').trim();

  if (!text) {
    return {
      pageId: page.id,
      pageNumber: page.pageNumber,
      text: '',
      blocks: [],
      lines: [],
      words: [],
    };
  }

  if (lines.length === 0) {
    return {
      pageId: page.id,
      pageNumber: page.pageNumber,
      text,
      blocks: [],
      lines: [],
      words: text.split(/\s+/).filter(Boolean).map((word) => ({ text: word })),
    };
  }

  return {
    pageId: page.id,
    pageNumber: page.pageNumber,
    text,
    blocks,
    lines,
    words,
  };
}

function readBlocks(layout: unknown): TextLayerBlock[] {
  if (!isRecord(layout) || !Array.isArray(layout.blocks)) {
    return [];
  }

  return layout.blocks.map((block) => ({
    lines: readLines(block),
  }));
}

function readLines(block: unknown): TextLayerLine[] {
  if (!isRecord(block) || !Array.isArray(block.lines)) {
    return [];
  }

  return block.lines.map((line) => {
    const words = readWords(line);
    return {
      text: isRecord(line) && typeof line.text === 'string' ? line.text : words.map((word) => word.text).join(' '),
      words,
    };
  });
}

function readWords(line: unknown): TextLayerWord[] {
  if (!isRecord(line) || !Array.isArray(line.words)) {
    return [];
  }

  return line.words
    .map((word): TextLayerWord | null => {
      if (!isRecord(word) || typeof word.text !== 'string') {
        return null;
      }

      return {
        text: word.text,
        confidence: typeof word.confidence === 'number' ? word.confidence : undefined,
        boundingBox: readBoundingBox(word.boundingBox),
        rotation: typeof word.rotation === 'number' ? word.rotation : undefined,
      };
    })
    .filter((word): word is TextLayerWord => Boolean(word));
}

function readBoundingBox(value: unknown) {
  if (!isRecord(value)) {
    return undefined;
  }

  const left = readNormalizedNumber(value.left);
  const top = readNormalizedNumber(value.top);
  const width = readNormalizedNumber(value.width);
  const height = readNormalizedNumber(value.height);

  if (left === undefined || top === undefined || width === undefined || height === undefined) {
    return undefined;
  }

  return { left, top, width, height };
}

function readNormalizedNumber(value: unknown) {
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
