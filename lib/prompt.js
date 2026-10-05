import { promptsFor } from './options.js';

// Always shown in every design, because this is the prize. Edit to match the client's brief.
const ALWAYS_INCLUDE = [
  'a premium composite deck',
  'a handcrafted timber-frame pergola',
  'sleek premium deck railing',
];

function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function buildPrompt({ houseStyle = [], lotSize = [], features = [] }) {
  const style = promptsFor('houseStyle', houseStyle).join(' and ') || 'classic';
  const lot = promptsFor('lotSize', lotSize).join(' or ') || 'typical suburban lot';
  const include = [...ALWAYS_INCLUDE, ...promptsFor('features', features)];

  return [
    "Edit image 0, a photo of a home's outdoor space.",
    'Keep the house exactly as it is: the same walls, windows, doors, roofline, colors, camera angle, perspective and lighting.',
    `Redesign only the yard as a luxury outdoor living space that suits a ${style} home on a ${lot}.`,
    `Include ${listJoin(include)}.`,
    'Scale everything to fit the space realistically.',
    'Photorealistic professional architectural photograph, natural daylight, crisp detail.',
    'No people, no text, no logos, no watermarks.',
  ].join(' ');
}

// Output size that keeps the photo's shape. The model accepts 256 to 1920 px per side.
export function outputSize(width, height) {
  const longSide = Math.min(1920, Math.max(256, parseInt(process.env.AI_OUTPUT_LONG_SIDE, 10) || 1024));
  const ratio = width > 0 && height > 0 ? width / height : 4 / 3;
  const round16 = (n) => Math.min(1920, Math.max(256, Math.round(n / 16) * 16));

  return ratio >= 1
    ? { width: round16(longSide), height: round16(longSide / ratio) }
    : { width: round16(longSide * ratio), height: round16(longSide) };
}
