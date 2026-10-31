export {};

declare global {
  interface CloudflareEnv {
    LISTING_IMAGES: {
      get(key: string): Promise<{
        body: ReadableStream<Uint8Array>;
        httpMetadata?: { contentType?: string };
        httpEtag?: string;
      } | null>;
      put(
        key: string,
        value: ArrayBuffer,
        options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> },
      ): Promise<unknown>;
      delete(key: string): Promise<void>;
    };
  }
}
