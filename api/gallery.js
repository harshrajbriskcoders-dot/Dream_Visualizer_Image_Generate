import { applyCors, clampInt } from '../lib/http.js';
import { getSubmissions } from '../lib/db.js';
import { imageUrl } from '../lib/cloudinary.js';
import { labelsFor } from '../lib/options.js';

// GET /api/gallery?page=1&limit=9
// Returns approved designs only, newest first. Names are shortened to "Sarah M.".
export default async function handler(req, res) {
  if (applyCors(req, res, { publicRead: true })) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });

  try {
    const page = clampInt(req.query.page, 1, 1, 500);
    const limit = clampInt(req.query.limit, 9, 1, 24);
    const col = await getSubmissions();

    const docs = await col
      .find(
        { status: 'approved', 'result.publicId': { $exists: true } },
        { projection: { firstName: 1, lastName: 1, houseStyle: 1, features: 1, original: 1, result: 1 } }
      )
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit + 1)
      .toArray();

    const items = docs.slice(0, limit).map((d) => ({
      id: d._id.toHexString(),
      name: `${d.firstName} ${d.lastName ? d.lastName[0].toUpperCase() + '.' : ''}`.trim(),
      styles: labelsFor('houseStyle', d.houseStyle),
      features: labelsFor('features', d.features),
      before: { url: imageUrl(d.original.publicId, { width: 900 }), width: d.original.width, height: d.original.height },
      after: { url: imageUrl(d.result.publicId, { width: 900 }), width: d.result.width, height: d.result.height },
    }));

    // Cache at Vercel's edge for 30 seconds so busy pages don't hit the database every time.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=30');
    return res.status(200).json({ items, page, hasMore: docs.length > limit });
  } catch (err) {
    console.error('[gallery]', err.message);
    return res.status(500).json({ error: "The gallery couldn't load. Refresh the page to try again." });
  }
}
