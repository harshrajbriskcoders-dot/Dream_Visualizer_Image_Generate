import { QUESTIONS, findOption } from './options.js';

const NAME_RE = /^[\p{L}\p{M}' .-]{1,50}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IMAGE_PREFIX_RE = /^data:image\/(jpeg|png|webp);base64,/;
// About 3 MB of image data. The browser shrinks photos to ~1600px first, so real uploads are far smaller.
const MAX_IMAGE_CHARS = 4_000_000;

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const toArray = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

const REQUIRED_MESSAGES = {
  houseStyle: 'Pick at least one house style.',
  lotSize: 'Pick your lot size.',
  features: 'Pick at least one thing to include.',
};

// Returns { ok, errors, data }. errors is keyed by field name, matching the form.
export function validateSubmission(body) {
  const errors = {};
  if (!body || typeof body !== 'object') {
    return { ok: false, errors: { form: 'The form data was missing. Reload the page and try again.' } };
  }

  const firstName = clean(body.firstName);
  const lastName = clean(body.lastName);
  const email = clean(body.email).toLowerCase();

  if (!NAME_RE.test(firstName)) errors.firstName = 'Enter your first name.';
  if (!NAME_RE.test(lastName)) errors.lastName = 'Enter your last name.';
  if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';

  const answers = {};
  for (const [key, q] of Object.entries(QUESTIONS)) {
    const ids = [...new Set(toArray(body[key]).filter((v) => typeof v === 'string'))];
    const valid = ids.filter((id) => findOption(key, id));
    const max = q.multi ? q.max || q.options.length : 1;

    if (valid.length !== ids.length) errors[key] = 'One of the answers is not on the list. Pick again.';
    else if (valid.length === 0) errors[key] = REQUIRED_MESSAGES[key] || 'Pick an answer.';
    else if (valid.length > max) errors[key] = max === 1 ? 'Pick one answer.' : `Pick up to ${max}.`;

    answers[key] = valid.slice(0, max);
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image) errors.image = 'Add a photo of your outdoor space.';
  else if (!IMAGE_PREFIX_RE.test(image)) errors.image = 'Use a JPG, PNG or WebP photo.';
  else if (image.length > MAX_IMAGE_CHARS) errors.image = 'That photo is too large. Choose a smaller one.';

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      firstName,
      lastName,
      email,
      ...answers,
      consent: body.consent === true,
      image,
    },
  };
}
