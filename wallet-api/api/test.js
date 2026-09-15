module.exports = async function handler(req, res) {
  const endpoints = {
    binance: 'https://api.binance.com/api/v3/time',
    bybit: 'https://api.bybit.com/v5/market/time',
    okx: 'https://www.okx.com/api/v5/public/time'
  };

  async function probe(url) {
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'Sallam-Wallet-Monitor/1.0' }
      });
      const text = await r.text();
      return {
        ok: r.ok,
        status: r.status,
        body: text.slice(0, 800)
      };
    } catch (error) {
      return {
        ok: false,
        status: null,
        error: String(error && error.message ? error.message : error)
      };
    }
  }

  const [binance, bybit, okx] = await Promise.all([
    probe(endpoints.binance),
    probe(endpoints.bybit),
    probe(endpoints.okx)
  ]);

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    vercelRegion: process.env.VERCEL_REGION || null,
    timestamp: new Date().toISOString(),
    binance,
    bybit,
    okx
  });
};
