import sharp from 'sharp';
import type { ObjectStorage } from '../../storage/types';
import type { DocumentCorners, EdgeDetectionResult } from '../types';
import type { EdgeDetectionProvider, EdgeDetectionProviderInput } from './edgeDetectionProvider';

const fullPageCorners: DocumentCorners = {
  topLeft: { x: 0, y: 0 },
  topRight: { x: 1, y: 0 },
  bottomRight: { x: 1, y: 1 },
  bottomLeft: { x: 0, y: 1 },
};

export class HeuristicEdgeDetectionProvider implements EdgeDetectionProvider {
  readonly name = 'heuristic';

  constructor(private readonly storage: ObjectStorage) {}

  async detectAndCorrect(input: EdgeDetectionProviderInput): Promise<EdgeDetectionResult> {
    const source = await this.storage.read(input.sourceImageUrl);
    const image = sharp(source, { failOn: 'none' }).rotate();
    const sourceMetadata = await image.metadata();
    const output = await image.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    const stored = await this.storage.write(input.outputStorageKey, output, 'image/jpeg');

    return {
      corners: fullPageCorners,
      confidence: 0.5,
      croppedImageUrl: stored.url,
      metadata: {
        provider: this.name,
        edgeDetectionMode: 'full-page-placeholder',
        perspectiveCorrectionRequested: input.params.perspectiveCorrection,
        perspectiveCorrectionImplemented: false,
        contourDetectionImplemented: false,
        outputCroppedImage: input.params.outputCroppedImage,
        outputContentType: 'image/jpeg',
        outputQuality: 92,
        source: {
          width: sourceMetadata.width,
          height: sourceMetadata.height,
          format: sourceMetadata.format,
        },
      },
    };
  }
}
