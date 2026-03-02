// ── OPENGRADIENT AI SIGNAL ENGINE (Python SDK backend) ──
const OG_API = 'http://127.0.0.1:5000/signal';

export async function getAISignal(coinName, symbol, price, change24h, timeframe) {
  try {
    console.log('[OG] Fetching signal for', coinName, timeframe);
    const res = await fetch(OG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coinName, symbol, price, change24h, timeframe }),
    });
    if (!res.ok) throw new Error('Server error: ' + res.status);
    const data = await res.json();
    console.log('[OG] Signal received:', data);
    return data;
  } catch (err) {
    console.error('[OG] Failed:', err.message);
    return null;
  }
}
