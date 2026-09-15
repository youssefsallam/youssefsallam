const crypto = require('crypto');

function signQuery(params, secret) {
  const query = new URLSearchParams(params).toString();
  const signature = crypto.createHmac('sha256', secret).update(query).digest('hex');
  return query + '&signature=' + signature;
}

async function signedGet(path, params, apiKey, secret) {
  const qs = signQuery(params, secret);
  const r = await fetch('https://api.binance.com' + path + '?' + qs, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'User-Agent': 'Sallam-Wallet-Monitor/1.0'
    },
    cache: 'no-store'
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const apiKey = String(process.env.BINANCE_API_KEY || '').trim();
  const secret = String(process.env.BINANCE_SECRET_KEY || '').trim();

  if (!apiKey || !secret) {
    return res.status(500).json({ ok: false, error: 'BINANCE_CONFIG_ERROR' });
  }

  try {
    const [timeResp, priceResp] = await Promise.all([
      fetch('https://api.binance.com/api/v3/time', { cache: 'no-store' }),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', { cache: 'no-store' })
    ]);

    const timeJson = await timeResp.json();
    const priceJson = await priceResp.json();
    const timestamp = Number(timeJson.serverTime || Date.now());
    const bnbPrice = Number(priceJson && priceJson.price ? priceJson.price : 0);
    const common = { recvWindow: '10000', timestamp: String(timestamp) };

    const account = await signedGet('/api/v3/account', common, apiKey, secret);
    if (!account.ok) {
      return res.status(account.status || 400).json({ ok: false, error: 'BINANCE_AUTH_FAILED' });
    }

    const wallet = await signedGet(
      '/sapi/v1/asset/wallet/balance',
      { quoteAsset: 'USDT', ...common },
      apiKey,
      secret
    );

    if (!wallet.ok || !Array.isArray(wallet.data)) {
      return res.status(wallet.status || 400).json({ ok: false, error: 'BINANCE_BALANCE_FAILED' });
    }

    return res.status(200).json({
      ok: true,
      signatureValid: true,
      bnbPrice: Number.isFinite(bnbPrice) && bnbPrice > 0 ? bnbPrice : null,
      wallet: {
        data: wallet.data.map(item => ({ balance: String(item && item.balance != null ? item.balance : '0') }))
      },
      updatedAt: new Date().toISOString()
    });
  } catch {
    return res.status(500).json({ ok: false, error: 'BINANCE_INTERNAL_ERROR' });
  }
};
