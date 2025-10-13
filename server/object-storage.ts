import { Client } from "@replit/object-storage";

/**
 * Replit Object Storage client for persistent file storage
 * Files stored here persist across deployments and restarts
 */
export const objectStorage = new Client({
  bucketId: "replit-objstore-dd5fa6c2-f648-4ba7-a3f1-0135431c2541"
});

/**
 * Upload a file to Object Storage
 * @param key Unique identifier for the file (e.g., "nursing-records/123/file.pdf")
 * @param buffer File buffer data
 * @param contentType MIME type of the file (optional, not used by current API)
 * @returns Promise that resolves when upload completes
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType?: string
): Promise<void> {
  const result = await objectStorage.uploadFromBytes(key, buffer);

  if (!result.ok) {
    throw new Error(`Failed to upload file: ${result.error}`);
  }
}

/**
 * Download a file from Object Storage
 * @param key Unique identifier for the file
 * @returns Promise that resolves to file buffer, or undefined if not found
 */
export async function downloadFile(key: string): Promise<Buffer | undefined> {
  const result = await objectStorage.downloadAsBytes(key);

  if (!result.ok) {
    // Return undefined if file not found
    return undefined;
  }

  // result.value is [Buffer], so extract the first element
  return result.value[0];
}

/**
 * Delete a file from Object Storage
 * @param key Unique identifier for the file
 * @returns Promise that resolves when deletion completes
 */
export async function deleteFile(key: string): Promise<void> {
  const result = await objectStorage.delete(key);

  if (!result.ok) {
    // Ignore if file doesn't exist, throw for other errors
    console.warn(`Failed to delete file ${key}:`, result.error);
  }
}

/**
 * Check if a file exists in Object Storage
 * @param key Unique identifier for the file
 * @returns Promise that resolves to true if file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  const result = await objectStorage.list({ prefix: key, maxResults: 1 });

  if (!result.ok) {
    return false;
  }

  // result.value is an array of StorageObject
  return result.value.length > 0;
}
