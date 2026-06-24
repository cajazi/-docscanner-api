import { describe, expect, it } from 'vitest';
import { buildSearchableTextLayer } from './textLayerBuilder';

describe('buildSearchableTextLayer', () => {
  it('builds text layer from OCR text and layout metadata', () => {
    const layer = buildSearchableTextLayer('doc_1', [
      {
        id: 'page_1',
        pageNumber: 1,
        ocrText: 'Hello world',
        ocrTextLayer: null,
        ocrLayout: {
          blocks: [
            {
              lines: [
                {
                  text: 'Hello world',
                  words: [
                    {
                      text: 'Hello',
                      confidence: 97,
                      boundingBox: { left: 0.1, top: 0.2, width: 0.2, height: 0.05 },
                    },
                    {
                      text: 'world',
                      confidence: 96,
                      boundingBox: { left: 0.32, top: 0.2, width: 0.2, height: 0.05 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);

    expect(layer.pages[0]).toMatchObject({
      pageId: 'page_1',
      pageNumber: 1,
      text: 'Hello world',
      words: [
        { text: 'Hello', confidence: 97, boundingBox: { left: 0.1, top: 0.2, width: 0.2, height: 0.05 } },
        { text: 'world', confidence: 96 },
      ],
    });
  });

  it('aggregates document searchable text and preserves page order', () => {
    const layer = buildSearchableTextLayer('doc_1', [
      { id: 'page_2', pageNumber: 2, ocrText: 'Second page', ocrLayout: null, ocrTextLayer: null },
      { id: 'page_1', pageNumber: 1, ocrText: 'First page', ocrLayout: null, ocrTextLayer: null },
    ]);

    expect(layer.pages.map((page) => page.pageNumber)).toEqual([1, 2]);
    expect(layer.searchableText).toBe('First page\n\nSecond page');
    expect(layer.pageCount).toBe(2);
  });

  it('handles pages without OCR', () => {
    const layer = buildSearchableTextLayer('doc_1', [
      { id: 'page_1', pageNumber: 1, ocrText: null, ocrLayout: null, ocrTextLayer: null },
    ]);

    expect(layer.pages[0]).toEqual({
      pageId: 'page_1',
      pageNumber: 1,
      text: '',
      blocks: [],
      lines: [],
      words: [],
    });
    expect(layer.searchableText).toBe('');
  });
});
