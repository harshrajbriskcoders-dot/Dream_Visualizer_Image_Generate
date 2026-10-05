import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSubmission } from '../lib/validate.js';
import { buildPrompt, outputSize } from '../lib/prompt.js';
import { publicQuestions } from '../lib/options.js';
import { toDataUri } from '../lib/cloudinary.js';
import submit from '../api/submit.js';
import options from '../api/options.js';

const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const good = {
  firstName: 'Sarah', lastName: "O'Neil", email: ' Sarah@Example.com ',
  houseStyle: ['modern', 'farmhouse'], lotSize: 'medium', features: ['firepit'],
  consent: true, image: IMG,
};

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => res;
  return res;
}

test('valid submission passes and is normalized', () => {
  const r = validateSubmission(good);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.data.email, 'sarah@example.com');
  assert.deepEqual(r.data.lotSize, ['medium']);
});

test('bad fields are reported by name', () => {
  const r = validateSubmission({ ...good, email: 'nope', houseStyle: [], lotSize: ['small', 'large'], features: ['x'], image: 'data:text/plain;base64,aa' });
  assert.equal(r.ok, false);
  for (const k of ['email', 'houseStyle', 'lotSize', 'features', 'image']) assert.ok(r.errors[k], k);
});

test('max selections enforced', () => {
  const r = validateSubmission({ ...good, houseStyle: ['modern', 'farmhouse', 'ranch'] });
  assert.match(r.errors.houseStyle, /up to 2/);
});

test('prompt includes answers and prize items', () => {
  const p = buildPrompt({ houseStyle: ['farmhouse'], lotSize: ['small'], features: ['firepit', 'hottub'] });
  assert.match(p, /modern farmhouse home on a small, compact lot/);
  assert.match(p, /composite deck/);
  assert.match(p, /a fire pit surrounded by seating and a built-in hot tub\./);
});

test('output size keeps shape, multiple of 16, within limits', () => {
  assert.deepEqual(outputSize(4000, 3000), { width: 1024, height: 768 });
  const tall = outputSize(1080, 1920);
  assert.equal(tall.height, 1024);
  assert.equal(tall.width % 16, 0);
  const pano = outputSize(8000, 1000);
  assert.ok(pano.height >= 256);
});

test('public questions hide prompts', () => {
  const q = publicQuestions();
  assert.equal(q.lotSize.max, 1);
  assert.equal(q.features.options[0].prompt, undefined);
});

test('toDataUri detects formats', () => {
  assert.match(toDataUri('/9j/abc'), /^data:image\/jpeg/);
  assert.match(toDataUri('iVBORw0'), /^data:image\/png/);
});

test('submit rejects other origins', async () => {
  process.env.ALLOWED_ORIGINS = 'https://dreamoutdoorliving.life';
  const res = mockRes();
  await submit({ method: 'POST', headers: { origin: 'https://evil.example' }, body: good }, res);
  assert.equal(res.statusCode, 403);
});

test('submit answers preflight for allowed origin', async () => {
  const res = mockRes();
  await submit({ method: 'OPTIONS', headers: { origin: 'https://dreamoutdoorliving.life' } }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], 'https://dreamoutdoorliving.life');
});

test('submit returns field errors', async () => {
  const res = mockRes();
  await submit({ method: 'POST', headers: { origin: 'https://dreamoutdoorliving.life' }, body: { ...good, email: 'x' } }, res);
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.email);
});

test('submit with missing config fails safely', async () => {
  delete process.env.MONGODB_URI;
  delete process.env.TURNSTILE_SECRET_KEY;
  const res = mockRes();
  await submit({ method: 'POST', headers: { origin: 'https://dreamoutdoorliving.life', 'x-forwarded-for': '1.2.3.4' }, body: good }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, 'CONFIG');
  assert.doesNotMatch(res.body.error, /MONGODB/);
});

test('options endpoint is public', () => {
  const res = mockRes();
  options({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.ok(res.body.questions.houseStyle.options.length > 0);
});
