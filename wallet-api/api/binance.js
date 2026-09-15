const crypto = require('crypto');

function signQuery(params, secret) {
  const query = new URLSearchParams(params).toString();
  const signature = crypto
    .createHmac('sha256', secret)
    .update(query)
    .digest('hex');
  return query + '&signature=' + signature;
}

async function signedGet(path, params, apiKey, secret) {
  const qs = signQuery(params, secret);
  const r = await fetch('https://api.binance.com' + path + '?' + qs, {
    method: 'GET',
    headers: {
      'X-MBX-APIKEY': apiKey,
      'User-Agent': 'Sallam-Wallet-Monitor/1.0'
    }
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const rawApiKey = process.env.BINANCE_API_KEY || '';
  const rawSecret = process.env.BINANCE_SECRET_KEY || '';
  const apiKey = rawApiKey.trim();
  const secret = rawSecret.trim();

  if (!apiKey || !secret) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: 'MISSING_BINANCE_ENV'
    });
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

    const common = {
      recvWindow: '10000',
      timestamp: String(timestamp)
    };

    const account = await signedGet('/api/v3/account', common, apiKey, secret);

    if (!account.ok) {
      return res.status(account.status || 400).json({
        ok: false,
        region: process.env.VERCEL_REGION || null,
        stage: 'signature-test',
        trimmedWhitespace: rawApiKey !== apiKey || rawSecret !== secret,
        status: account.status,
        data: account.data
      });
    }

    const wallet = await signedGet(
      '/sapi/v1/asset/wallet/balance',
      { quoteAsset: 'USDT', ...common },
      apiKey,
      secret
    );

    return res.status(wallet.ok ? 200 : wallet.status).json({
      ok: wallet.ok,
      region: process.env.VERCEL_REGION || null,
      signatureValid: true,
      bnbPrice: Number.isFinite(bnbPrice) && bnbPrice > 0 ? bnbPrice : null,
      wallet
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: String(error && error.message ? error.message : error)
    });
  }
};
