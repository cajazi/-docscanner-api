export enum ScanSourceRole {
  ORIGINAL = 'ORIGINAL',
  CROPPED = 'CROPPED',
  ENHANCED = 'ENHANCED',
}

export enum ScanConsumer {
  OCR = 'OCR',
  ENHANCEMENT = 'ENHANCEMENT',
  EDGE_DETECTION = 'EDGE_DETECTION',
  PDF_EXPORT = 'PDF_EXPORT',
}

export type ScanSourcePage = {
  originalImageUrl: string | null;
  croppedImageUrl: string | null;
  enhancedImageUrl: string | null;
};

export type ResolvedScanSource = {
  role: ScanSourceRole;
  imageUrl: string;
};
