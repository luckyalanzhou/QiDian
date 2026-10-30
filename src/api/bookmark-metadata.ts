import { requestJson } from './client';
import type { BookmarkMetadata } from './contracts';

export function fetchBookmarkMetadata(url: string, signal?: AbortSignal): Promise<BookmarkMetadata> {
  return requestJson('/bookmark-metadata', 'bookmarkMetadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal
  }, 'bookmarkMetadataRequest');
}
