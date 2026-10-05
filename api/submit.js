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

    // 7. Send both images back to the page
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
        .catch(() => {});
    }
    return res.status(e.status).json({ error: e.publicMessage, code: e.code });
  }
}
