// Tests Cloudinary + Cloudflare AI on one photo, without Shopify or MongoDB.
// Usage: npm run try:ai -- ./my-backyard.jpg
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { uploadImage, fetchResizedBlob, imageUrl, toDataUri } from '../lib/cloudinary.js';
import { generateDesign, AI_MODEL, AI_INPUT_MAX } from '../lib/ai.js';
import { buildPrompt, outputSize } from '../lib/prompt.js';

const file = process.argv[2];
if (!file) {
  console.error('Give a photo path: npm run try:ai -- ./my-backyard.jpg');
  process.exit(1);
}

const ext = path.extname(file).toLowerCase();
const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
const dataUri = `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
const id = `test-${Date.now()}`;

const answers = { houseStyle: ['farmhouse'], lotSize: ['medium'], features: ['firepit', 'lighting', 'dining'] };
const prompt = buildPrompt(answers);

console.log('1/4 Uploading original to Cloudinary...');
const original = await uploadImage(dataUri, { folder: 'tests', id: `${id}-original` });

console.log(`2/4 Fetching ${AI_INPUT_MAX}px copy for the AI...`);
const input = await fetchResizedBlob(original.publicId, AI_INPUT_MAX);

const size = outputSize(original.width, original.height);
console.log(`3/4 Generating with ${AI_MODEL} at ${size.width}x${size.height}...`);
console.log(`    Prompt: ${prompt}`);
const t = Date.now();
const b64 = await generateDesign({ image: input, prompt, ...size });
console.log(`    Done in ${((Date.now() - t) / 1000).toFixed(1)}s`);

console.log('4/4 Uploading result to Cloudinary...');
const result = await uploadImage(toDataUri(b64), { folder: 'tests', id: `${id}-result` });

console.log('\nBefore:', imageUrl(original.publicId));
console.log('After: ', imageUrl(result.publicId));
