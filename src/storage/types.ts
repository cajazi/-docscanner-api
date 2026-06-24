export type StoredObject = {
  key: string;
  url: string;
};

export interface ObjectStorage {
  read(sourceUrl: string): Promise<Buffer>;
  write(key: string, data: Buffer, contentType: string): Promise<StoredObject>;
}
