import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { type CapturedImageAttachment } from '@yourtutor/ui';

export interface CompressImageOptions {
  maxDimension?: number;
  jpegQuality?: number;
}

/**
 * Lightweight client-side image compression and orientation normalization
 * before uploading exam photos to multimodal LLM APIs.
 */
export async function compressExamImageBase64(
  base64: string,
  mimeType: string,
  options: CompressImageOptions = {}
): Promise<{ dataBase64: string; mimeType: string }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return { dataBase64: base64, mimeType };
  }

  const maxDim = options.maxDimension ?? 1600;
  const quality = options.jpegQuality ?? 0.82;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const targetW = Math.max(1, Math.round(img.width * scale));
      const targetH = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ dataBase64: base64, mimeType });
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const commaIdx = dataUrl.indexOf(',');
      resolve({
        dataBase64: commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : base64,
        mimeType: 'image/jpeg',
      });
    };
    img.onerror = () => resolve({ dataBase64: base64, mimeType });
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

/**
 * Invokes Capacitor Camera or Photo Gallery with automatic EXIF orientation correction
 * (`correctOrientation: true`) and client-side compression for exam photo recognition.
 */
export async function captureAndCompressExamPhoto(
  source: 'camera' | 'gallery'
): Promise<CapturedImageAttachment | null> {
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.Base64,
    source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
  });

  if (!photo.base64String) {
    return null;
  }

  const rawMime = photo.format ? `image/${photo.format === 'jpg' ? 'jpeg' : photo.format}` : 'image/jpeg';
  const compressed = await compressExamImageBase64(photo.base64String, rawMime);
  return {
    mimeType: compressed.mimeType,
    dataBase64: compressed.dataBase64,
    fileName: `exam-${source}-${Date.now()}.jpg`,
  };
}
