import { ScanConsumer, ScanSourceRole, type ResolvedScanSource, type ScanSourcePage } from './types';

export class ScanSourceResolutionError extends Error {
  constructor(
    readonly consumer: ScanConsumer,
    message: string,
  ) {
    super(message);
  }
}

export function resolvePageImageSource(page: ScanSourcePage, consumer: ScanConsumer): ResolvedScanSource {
  const sourceOrder = getSourceOrder(consumer);

  for (const role of sourceOrder) {
    const imageUrl = getImageUrlForRole(page, role);
    if (imageUrl) {
      return { role, imageUrl };
    }
  }

  throw new ScanSourceResolutionError(
    consumer,
    `No usable page image source is available for ${consumer}`,
  );
}

function getSourceOrder(consumer: ScanConsumer): ScanSourceRole[] {
  if (consumer === ScanConsumer.OCR) {
    return [ScanSourceRole.CROPPED, ScanSourceRole.ENHANCED, ScanSourceRole.ORIGINAL];
  }

  if (consumer === ScanConsumer.ENHANCEMENT) {
    return [ScanSourceRole.CROPPED, ScanSourceRole.ORIGINAL];
  }

  if (consumer === ScanConsumer.EDGE_DETECTION) {
    return [ScanSourceRole.ORIGINAL];
  }

  return [ScanSourceRole.ENHANCED, ScanSourceRole.CROPPED, ScanSourceRole.ORIGINAL];
}

function getImageUrlForRole(page: ScanSourcePage, role: ScanSourceRole) {
  if (role === ScanSourceRole.ORIGINAL) {
    return page.originalImageUrl;
  }

  if (role === ScanSourceRole.CROPPED) {
    return page.croppedImageUrl;
  }

  return page.enhancedImageUrl;
}
