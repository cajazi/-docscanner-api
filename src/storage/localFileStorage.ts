import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ObjectStorage, StoredObject } from './types';

type LocalFileStorageOptions = {
  rootDir: string;
  publicBaseUrl?: string;
};

export class LocalFileStorage implements ObjectStorage {
  constructor(private readonly options: LocalFileStorageOptions) {}

  async read(sourceUrl: string): Promise<Buffer> {
    if (/^https?:\/\//i.test(sourceUrl)) {
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Unable to read source image: ${response.status} ${response.statusText}`);
      }

      return Buffer.from(await response.arrayBuffer());
    }

    const filePath = sourceUrl.startsWith('file://') ? fileURLToPath(sourceUrl) : sourceUrl;
    return readFile(filePath);
  }

  async write(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    if (!['image/jpeg', 'application/pdf'].includes(contentType)) {
      throw new Error(`Unsupported stored object content type: ${contentType}`);
    }

    const normalizedKey = key.replace(/\\/g, '/').replace(/^\/+/, '');
    const outputPath = path.join(this.options.rootDir, normalizedKey);

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, data);

    return {
      key: normalizedKey,
      url: this.options.publicBaseUrl
        ? `${this.options.publicBaseUrl.replace(/\/$/, '')}/${normalizedKey}`
        : outputPath,
    };
  }
}
