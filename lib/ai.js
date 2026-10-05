import { AppError } from './errors.js';

// To switch to a paid model later (Gemini, fal, OpenAI), rewrite generateDesign() only.
// It takes the photo as a Blob plus a prompt and must return the new image as base64.

export const AI_MODEL = process.env.CF_IMAGE_MODEL || '@cf/black-forest-labs/flux-2-klein-4b';

// FLUX.2 on Workers AI needs input images no larger than 512 x 512.
export const AI_INPUT_MAX = 512;

const LIMIT_MESSAGE = "Today's free designs are used up. Come back tomorrow to create yours.";

export async function generateDesign({ image, prompt, width, height, seed }) {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_API_TOKEN;
  if (!accountId || !token) throw new AppError('CF_ACCOUNT_ID or CF_API_TOKEN is not set', 500, 'CONFIG');

  // Multipart form, as Cloudflare documents for FLUX.2. fetch() adds the boundary header itself.
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('input_image_0', image, 'input.jpg');
  form.append('width', String(width));
  form.append('height', String(height));
  if (seed != null) form.append('seed', String(seed));

  let res;
  try {
    res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${AI_MODEL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    throw new AppError(
      `Cloudflare AI request failed: ${err.message}`,
      504,
      'AI_TIMEOUT',
      timedOut
        ? 'Creating the design took too long. Try again.'
        : "The design service couldn't be reached. Try again in a few minutes."
    );
  }

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // not JSON; handled below
  }

  if (!res.ok || data?.success === false) {
    const detail = data?.errors?.map((e) => e.message).join('; ') || text.slice(0, 300);
    if (res.status === 429 || /neuron|quota|daily|allocation|rate limit/i.test(detail)) {
      throw new AppError(`Cloudflare AI limit: ${detail}`, 503, 'DAILY_LIMIT', LIMIT_MESSAGE);
    }
    if (/nsfw|safety|flagged|moderation/i.test(detail)) {
      throw new AppError(
        `Cloudflare AI safety block: ${detail}`,
        422,
        'AI_BLOCKED',
        "This photo couldn't be used. Try a photo of just your yard, deck or patio."
      );
    }
    throw new AppError(`Cloudflare AI error (${res.status}): ${detail}`, 502, 'AI_FAILED');
  }

  const b64 = data?.result?.image ?? data?.image;
  if (!b64 || typeof b64 !== 'string') {
    throw new AppError(`Cloudflare AI returned no image: ${text.slice(0, 200)}`, 502, 'AI_FAILED');
  }
  return b64;
}
