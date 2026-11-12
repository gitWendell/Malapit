import { PILOT_LIMITS } from "./pilot-limits.ts";

export async function preparePropertyPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an original photo smaller than 12 MB.");
  let image: ImageBitmap;
  try { image = await createImageBitmap(file); }
  catch { throw new Error("This photo could not be opened. Choose another image."); }
  try {
    const scale = Math.min(1, PILOT_LIMITS.photoDimension / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    let width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
    for (let pass = 0; pass < 5; pass++) {
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare this photo.");
      context.fillStyle = "#fff"; context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      for (const quality of [0.84, 0.7, 0.55]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= PILOT_LIMITS.photoBytes) return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      }
      width = Math.max(1, Math.round(width * 0.75)); height = Math.max(1, Math.round(height * 0.75));
    }
    throw new Error("This photo is too detailed to upload. Please choose a smaller one.");
  } finally { image.close(); }
}
