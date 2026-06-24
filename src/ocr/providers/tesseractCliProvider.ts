import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { OCRLine, OCRProvider, OCRProviderResult, OCRWord } from '../types';

const execFileAsync = promisify(execFile);

type TesseractProviderOptions = {
  binaryPath: string;
};

type TsvWord = OCRWord & {
  blockNumber: number;
  paragraphNumber: number;
  lineNumber: number;
};

export class TesseractCliOCRProvider implements OCRProvider {
  readonly name = 'TESSERACT_CLI' as const;

  constructor(private readonly options: TesseractProviderOptions) {}

  async recognizePage(input: { imageUri: string; language: string }): Promise<OCRProviderResult> {
    const imagePath = resolveLocalImagePath(input.imageUri);
    const { stdout } = await execFileAsync(
      this.options.binaryPath,
      [imagePath, 'stdout', '-l', input.language, 'tsv'],
      { maxBuffer: 20 * 1024 * 1024 },
    );

    const words = parseTesseractTsv(stdout);
    const lines = groupWordsIntoLines(words);
    const text = lines.map((line) => line.text).join('\n').trim();

    return {
      text,
      layout: {
        schemaVersion: 1,
        provider: this.name,
        blocks: [{ lines }],
      },
      textLayer: {
        schemaVersion: 1,
        source: 'ocr',
        lines: lines.map((line) => ({
          text: line.text,
          words: line.words,
        })),
      },
    };
  }
}

function resolveLocalImagePath(imageUri: string) {
  if (imageUri.startsWith('file://')) {
    return fileURLToPath(imageUri);
  }

  if (/^https?:\/\//i.test(imageUri)) {
    throw new Error('Tesseract CLI provider requires a local image path or file:// URI');
  }

  return imageUri;
}

function parseTesseractTsv(tsv: string): TsvWord[] {
  const [headerLine, ...rows] = tsv.trim().split(/\r?\n/);
  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split('\t');
  const index = Object.fromEntries(headers.map((header, position) => [header, position]));

  return rows
    .map((row) => row.split('\t'))
    .filter((columns) => columns[index.level] === '5')
    .map((columns) => ({
      text: columns[index.text]?.trim() ?? '',
      confidence: parseConfidence(columns[index.conf]),
      boundingBox: {
        left: parseNumber(columns[index.left]),
        top: parseNumber(columns[index.top]),
        width: parseNumber(columns[index.width]),
        height: parseNumber(columns[index.height]),
      },
      blockNumber: parseNumber(columns[index.block_num]),
      paragraphNumber: parseNumber(columns[index.par_num]),
      lineNumber: parseNumber(columns[index.line_num]),
    }))
    .filter((word) => word.text.length > 0);
}

function groupWordsIntoLines(words: TsvWord[]): OCRLine[] {
  const byLine = new Map<string, TsvWord[]>();

  for (const word of words) {
    const key = `${word.blockNumber}:${word.paragraphNumber}:${word.lineNumber}`;
    const lineWords = byLine.get(key) ?? [];
    lineWords.push(word);
    byLine.set(key, lineWords);
  }

  return Array.from(byLine.values()).map((lineWords) => ({
    text: lineWords.map((word) => word.text).join(' '),
    confidence: averageConfidence(lineWords),
    words: lineWords.map(({ blockNumber: _block, paragraphNumber: _paragraph, lineNumber: _line, ...word }) => word),
  }));
}

function parseNumber(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseConfidence(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function averageConfidence(words: OCRWord[]) {
  const confidences = words
    .map((word) => word.confidence)
    .filter((confidence): confidence is number => confidence !== null);

  if (confidences.length === 0) {
    return null;
  }

  return confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;
}
