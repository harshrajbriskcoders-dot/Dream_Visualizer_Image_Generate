import { v2 as cloudinary } from 'cloudinary';
import { AppError } from './errors.js';

const ROOT = (process.env.CLOUDINARY_FOLDER || 'dream-visualizer').replace(/^\/+|\/+$/g, '');
let configured = false;

function client() {
  if (!configured) {
    if (!process.env.CLOUDINARY_URL) throw new AppError('CLOUDINARY_URL is not set', 500, 'CONFIG');
    cloudinary.config({ secure: true }); // reads the rest from CLOUDINARY_URL
    configured = true;
  }
  return cloudinary;
}

// file: a data URI ("data:image/jpeg;base64,...") or a URL.
// Returns { publicId, url, width, height }.
export async function uploadImage(file, { folder, id }) {
  try {
    const res = await client().uploader.upload(file, {
      public_id: `${ROOT}/${folder}/${id}`,
      resource_type: 'image',
      overwrite: false,
    });
    return { publicId: res.public_id, url: res.secure_url, width: res.width, height: res.height };
  } catch (err) {
    const msg = err?.message || err?.error?.message || String(err);
    throw new AppError(
      `Cloudinary upload failed: ${msg}`,
      502,
      'STORAGE',
      "The photo couldn't be saved. Try a different photo, or try again in a few minutes."
    );
  }
}

// Downloads a copy that fits inside max x max, for the AI model's input limit.
export async function fetchResizedBlob(publicId, max) {
  const url = client().url(publicId, {
    secure: true,
    format: 'jpg',
    transformation: [{ width: max, height: max, crop: 'limit', quality: 90 }],
  });
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new AppError(`Resized image fetch failed (${res.status})`, 502, 'STORAGE');
  return new Blob([await res.arrayBuffer()], { type: 'image/jpeg' });
}

// A web-friendly URL: picks the best format and quality for each browser.
export function imageUrl(publicId, { width = 1400 } = {}) {
  return client().url(publicId, {
    secure: true,
    transformation: [{ width, crop: 'limit', fetch_format: 'auto', quality: 'auto' }],
  });
}

// A URL that downloads the full-size JPG instead of opening it.
export function downloadUrl(publicId) {
  return client().url(publicId, {
    secure: true,
    format: 'jpg',
    transformation: [{ flags: 'attachment' }],
  });
}

// Turns raw base64 from the AI into a data URI Cloudinary can upload.
export function toDataUri(b64) {
  if (b64.startsWith('data:')) return b64;
  const mime = b64.startsWith('/9j/')
    ? 'image/jpeg'
    : b64.startsWith('UklGR')
      ? 'image/webp'
      : 'image/png';
  return `data:${mime};base64,${b64}`;
}
