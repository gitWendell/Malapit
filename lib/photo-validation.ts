import { PILOT_LIMITS } from "./pilot-limits.ts";

export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 255 || bytes[1] !== 216) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) return null;
    if (marker === 216 || marker >= 208 && marker <= 215) continue;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return null;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) return null;
      const height = bytes[offset + 3] * 256 + bytes[offset + 4], width = bytes[offset + 5] * 256 + bytes[offset + 6];
      return width && height ? { width, height } : null;
    }
    offset += length;
  }
  return null;
}

export function photoValidationError(bytes: Uint8Array, contentType: string): string | null {
  if (bytes.byteLength > PILOT_LIMITS.photoBytes) return "Please let the listing form resize this photo before uploading.";
  const size = contentType === "image/jpeg" ? jpegDimensions(bytes) : null;
  if (!size) return "Choose a valid property photo using the listing form.";
  if (Math.max(size.width, size.height) > PILOT_LIMITS.photoDimension) return "This photo needs resizing. Please add it again using the listing form.";
  return null;
}
