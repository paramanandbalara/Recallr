import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSettings, type Settings } from './settings.js';

// File storage (Amazon S3, or S3-compatible storage such as Cloudflare R2), set up in Admin → Settings → Storage.
// Used for the copies of users' profiles and their original resume files. Without a bucket nothing is stored here:
// profiles stay in the database and resume files aren't kept.

export interface ObjectStore {
  put(key: string, body: Buffer | string, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  // A link that downloads the object for `seconds`, without signing in
  signedUrl(key: string, seconds: number, fileName?: string): Promise<string>;
}

const s3Store = (s: Settings): ObjectStore => {
  const endpoint = s.s3Endpoint.trim();
  const accessKeyId = s.s3AccessKeyId.trim();
  const client = new S3Client({
    region: s.s3Region.trim() || 'ap-south-1',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    // No keys: the default AWS chain (instance role, environment, ~/.aws)
    ...(accessKeyId && s.s3SecretAccessKey ? { credentials: { accessKeyId, secretAccessKey: s.s3SecretAccessKey } } : {}),
  });
  const Bucket = s.s3Bucket.trim();
  // AWS encrypts with its own keys when asked; R2 and most others always encrypt and reject the header
  const encryption = endpoint ? {} : { ServerSideEncryption: 'AES256' as const };
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType, ...encryption }));
    },
    async get(key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      if (!res.Body) throw new Error(`Empty object: ${key}`);
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    signedUrl(key, seconds, fileName) {
      const disposition = fileName ? `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` : undefined;
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: disposition }), { expiresIn: seconds });
    },
  };
};

// The client is made once and made again only when the storage settings change
let cached: { signature: string; store: ObjectStore } | null = null;
let testStore: ObjectStore | null | undefined; // Set by tests only

export const objectStore = async (): Promise<ObjectStore | null> => {
  if (testStore !== undefined) return testStore;
  const s = await getSettings();
  if (!s.s3Bucket.trim()) return null;
  const signature = JSON.stringify([s.s3Bucket, s.s3Region, s.s3AccessKeyId, s.s3SecretAccessKey, s.s3Endpoint]);
  if (cached?.signature !== signature) cached = { signature, store: s3Store(s) };
  return cached.store;
};

// Whether S3 is set up
export const storageReady = async () => !!(await objectStore());

// Tests: a fake store, null for "not set up", or undefined to go back to the settings
export const setObjectStoreForTests = (store: ObjectStore | null | undefined) => { testStore = store; };

// An in-memory store, for tests
export const memoryStore = () => {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const store: ObjectStore & { objects: typeof objects } = {
    objects,
    async put(key, body, contentType) { objects.set(key, { body: Buffer.from(body), contentType }); },
    async get(key) {
      const object = objects.get(key);
      if (!object) throw new Error(`No such object: ${key}`);
      return object.body;
    },
    async delete(key) { objects.delete(key); },
    async signedUrl(key, seconds) { return `https://storage.test/${key}?expires=${seconds}`; },
  };
  return store;
};
