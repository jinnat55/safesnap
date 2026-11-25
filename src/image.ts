/** Chrome's on-device model accepts only JPEG and PNG, so other formats are converted first. */
const MAX_EDGE = 1568;

export async function prepareImage(file: File): Promise<{ file: File; data: string; mimeType: string }> {
  let blob: Blob = file;
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
    blob = await reencode(file, 'image/png');
  }
  const bitmap = await createImageBitmap(blob);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest > MAX_EDGE) {
    blob = await reencode(blob, blob.type === 'image/png' ? 'image/png' : 'image/jpeg');
  }
  bitmap.close();
  const mimeType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const data = await blobToBase64(blob);
  return { file: new File([blob], file.name, { type: mimeType }), data, mimeType };
}

async function reencode(blob: Blob, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the image.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the image.'))), type, 0.92),
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
}

/** Builds the inline image part the Firebase AI Logic SDK expects (on-device accepts inline data only). */
export function imagePart(image: { data: string; mimeType: string }) {
  return { type: 'inlineData' as const, inlineData: { data: image.data, mimeType: image.mimeType } };
}
