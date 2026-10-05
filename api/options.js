import { applyCors } from '../lib/http.js';
import { publicQuestions } from '../lib/options.js';

// GET /api/options: the questions and answers the form shows.
export default function handler(req, res) {
  if (applyCors(req, res, { publicRead: true })) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET.' });

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json({ questions: publicQuestions() });
}
