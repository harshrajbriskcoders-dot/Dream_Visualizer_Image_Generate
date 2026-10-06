import { ObjectId } from 'mongodb';
import { applyCors, getClientIp, hashIp, intFromEnv } from '../lib/http.js';
import { validateSubmission } from '../lib/validate.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { getSubmissions } from '../lib/db.js';
import { uploadImage, fetchResizedBlob, imageUrl, downloadUrl, toDataUri } from '../lib/cloudinary.js';
import { generateDesign, AI_MODEL, AI_INPUT_MAX } from '../lib/ai.js';
import { buildPrompt, outputSize } from '../lib/prompt.js';
import { AppError } from '../lib/errors.js';

const LIMITS = {
  perEmail: intFromEnv('MAX_PER_EMAIL', 2),
  perIpPerDay: intFromEnv('MAX_PER_IP_PER_DAY', 5),
  perDay: intFromEnv('MAX_PER_DAY', 40),
};

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ---------- Shopify copy: first name, last name, email and both image links ----------
const SHOPIFY_TYPE = 'dream_design';
const shopifyCache = globalThis.__dvShopify || (globalThis.__dvShopify = { token: null, expiresAt: 0 });

async function getShopifyToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  if (shopifyCache.token && Date.now() < shopifyCache.expiresAt) return shopifyCache.token;

  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID || '',
      client_secret: process.env.SHOPIFY_CLIENT_SECRET || '',
    }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Shopify token failed (${res.status}) ${body.error || ''}`);

  shopifyCache.token = body.access_token;
  shopifyCache.expiresAt = Date.now() + ((body.expires_in || 86399) - 300) * 1000; // renew 5 min early
  return shopifyCache.token;
}

async function saveToShopify(lead) {
  const token = await getShopifyToken();
  const res = await fetch(`https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-10/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({
      query: `mutation SaveDesign($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject { id }
          userErrors { field message }
        }
      }`,
      variables: {
        handle: { type: SHOPIFY_TYPE, handle: `design-${lead.id}` },
        metaobject: {
          fields: [
            { key: 'first_name', value: lead.firstName },
            { key: 'last_name', value: lead.lastName },
            { key: 'email', value: lead.email },
            { key: 'original_image', value: lead.originalUrl },
            { key: 'generated_image', value: lead.generatedUrl },
          ],
        },
      },
    }),
    signal: AbortSignal.timeout(5000),
  });

  if (res.status === 401) shopifyCache.token = null; // get a fresh token next time
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) throw new Error(`Shopify API error (${res.status})`);
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));

  const { metaobject, userErrors } = body.data.metaobjectUpsert;
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join('; '));
  return metaobject.id;
}

// Never throws: if Shopify fails, the visitor still gets their design.
async function copyToShopify(col, _id, lead) {
  if (!process.env.SHOPIFY_STORE_DOMAIN) {
    console.warn('[submit] Shopify is not set up, so this design was not copied.');
    return;
  }
  try {
    const shopifyId = await saveToShopify(lead);
    await col.updateOne({ _id }, { $set: { shopifyId, shopifySyncedAt: new Date() } });
  } catch (err) {
    console.error(`[submit] Shopify copy failed: ${err.message}`);
    await col.updateOne({ _id }, { $set: { shopifyError: err.message.slice(0, 500) } }).catch(() => { });
  }
}

// ---------- end Shopify copy ----------

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  let col = null;
  let submissionId = null;

  try {
    // 1. Check the form
    const { ok, errors, data } = validateSubmission(req.body);
    if (!ok) return res.status(400).json({ error: 'Fix the highlighted fields, then try again.', fields: errors });

    // 2. Check the visitor is human
    const ip = getClientIp(req);
    if (!(await verifyTurnstile(req.body.turnstileToken, ip))) {
      throw new AppError('Turnstile failed', 400, 'CAPTCHA', "The security check didn't pass. Complete it again, then resubmit.");
    }

    // 3. Check limits (protects the free AI allowance)
    col = await getSubmissions();
    const ipHash = hashIp(ip);
    const now = new Date();
    const [byEmail, byIp, today] = await Promise.all([
      col.countDocuments({ email: data.email, status: { $ne: 'failed' } }),
      col.countDocuments({ ipHash, status: { $ne: 'failed' }, createdAt: { $gte: new Date(now - 864e5) } }),
      col.countDocuments({ createdAt: { $gte: startOfUtcDay(now) } }),
    ]);
    if (today >= LIMITS.perDay) {
      throw new AppError('Daily cap reached', 429, 'DAILY_LIMIT', "Today's free designs are used up. Come back tomorrow to create yours.");
    }
    if (byEmail >= LIMITS.perEmail) {
      throw new AppError('Email cap reached', 429, 'EMAIL_LIMIT',
        `Each email address can create ${LIMITS.perEmail} design${LIMITS.perEmail === 1 ? '' : 's'}, and this one has used them all.`);
    }
    if (byIp >= LIMITS.perIpPerDay) {
      throw new AppError('IP cap reached', 429, 'IP_LIMIT', "You've created the most designs allowed today. Come back tomorrow.");
    }

    // 4. Save the original photo and the record
    submissionId = new ObjectId();
    const id = submissionId.toHexString();
    const original = await uploadImage(data.image, { folder: 'originals', id });

    await col.insertOne({
      _id: submissionId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      houseStyle: data.houseStyle,
      lotSize: data.lotSize,
      features: data.features,
      galleryConsent: data.consent,
      original,
      result: null,
      status: 'processing',
      ipHash,
      createdAt: now,
    });

    // 5. Generate the design
    const prompt = buildPrompt(data);
    const input = await fetchResizedBlob(original.publicId, AI_INPUT_MAX);
    const size = outputSize(original.width, original.height);
    const startedAt = Date.now();
    const b64 = await generateDesign({ image: input, prompt, ...size });
    const generationMs = Date.now() - startedAt;

    // 6. Save the design and update the record
    const result = await uploadImage(toDataUri(b64), { folder: 'results', id });
    const status = !data.consent ? 'private' : process.env.AUTO_APPROVE === 'true' ? 'approved' : 'pending';

    await col.updateOne(
      { _id: submissionId },
      {
        $set: {
          result,
          status,
          prompt,
          model: AI_MODEL,
          generationMs,
          completedAt: new Date(),
          ...(status === 'approved' ? { approvedAt: new Date() } : {}),
        },
      }
    );

    // 7. Copy name, email and both image links to Shopify
    await copyToShopify(col, submissionId, {
      id,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      originalUrl: original.url,
      generatedUrl: result.url,
    });

    // 8. Send both images back to the page

    return res.status(200).json({
      id,
      status,
      before: { url: imageUrl(original.publicId), width: original.width, height: original.height },
      after: { url: imageUrl(result.publicId), width: result.width, height: result.height },
      download: downloadUrl(result.publicId),
    });

  } catch (err) {
    const e = err instanceof AppError ? err : new AppError(err?.message || String(err), 500);
    console.error(`[submit] ${e.code}: ${e.message}`);

    if (col && submissionId) {
      await col
        .updateOne({ _id: submissionId }, { $set: { status: 'failed', error: e.message.slice(0, 500), failedAt: new Date() } })
        .catch(() => { });
    }
    return res.status(e.status).json({ error: e.publicMessage, code: e.code });
  }
}
1