// Verifies a Cloudflare Turnstile token. If no secret is set, the check is skipped (testing).
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token || typeof token !== 'string') return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== 'unknown') body.append('remoteip', ip);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] verification request failed:', err.message);
    return false;
  }
}
