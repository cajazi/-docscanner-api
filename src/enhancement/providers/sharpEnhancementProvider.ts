import sharp from 'sharp';
import type { ObjectStorage } from '../../storage/types';
import type { EnhancementProvider, EnhancementProviderInput, EnhancementProviderResult } from '../types';

export class SharpEnhancementProvider implements EnhancementProvider {
  readonly name = 'SHARP';

  constructor(private readonly storage: ObjectStorage) {}

  async enhance(input: EnhancementProviderInput): Promise<EnhancementProviderResult> {
    const source = await this.storage.read(input.originalImageUrl);
    let pipeline = sharp(source, { failOn: 'none' }).rotate();
    const mode = input.params.mode.toLowerCase();

    if (mode === 'document' || mode === 'auto' || mode === 'magic_color') {
      pipeline = pipeline.normalize().modulate({ brightness: input.params.brightness }).linear(input.params.contrast, 0).sharpen({
        sigma: 1,
        m1: 1,
        m2: 2,
      });
    } else if (mode === 'grayscale' || mode === 'black_white') {
      pipeline = pipeline.grayscale().normalize().modulate({ brightness: input.params.brightness }).linear(input.params.contrast, 0).sharpen({
        sigma: 1,
        m1: 1,
        m2: 2,
      });
    } else {
      pipeline = pipeline.normalize().modulate({ brightness: input.params.brightness }).linear(input.params.contrast, 0);
    }

    const enhanced = await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    const stored = await this.storage.write(input.outputKey, enhanced, 'image/jpeg');

    return {
      enhancedImageUrl: stored.url,
      metadata: {
        provider: this.name,
        mode: input.params.mode,
        outputKey: stored.key,
        outputContentType: 'image/jpeg',
        outputQuality: 92,
        transforms: {
          autoRotate: true,
          normalize: true,
          grayscale: mode === 'grayscale' || mode === 'black_white',
          sharpen: mode !== 'color',
          brightness: input.params.brightness,
          contrast: input.params.contrast,
        },
        futureCapabilities: {
          deskewRequested: input.params.deskew,
          deskewImplemented: false,
          perspectiveCorrectionRequested: input.params.perspectiveCorrection,
          perspectiveCorrectionImplemented: false,
        },
      },
    };
  }
}
