import { describe, expect, it } from 'vitest';
import { shouldEnablePdfExportProcessor } from './pdfExportProcessor';

describe('pdf export processor configuration', () => {
  it('is disabled in test env even when configured on', () => {
    expect(shouldEnablePdfExportProcessor('test', true)).toBe(false);
  });

  it('is disabled when PDF_EXPORT_PROCESSOR_ENABLED=false', () => {
    expect(shouldEnablePdfExportProcessor('production', false)).toBe(false);
  });
});
