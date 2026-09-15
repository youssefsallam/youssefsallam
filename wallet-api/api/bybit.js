const crypto = require('crypto');

function signGet(timestamp, apiKey, recvWindow, queryString, secret) {
  const payload = String(timestamp) + apiKey + String(recvWindow) + queryString;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function bybitGet(path, params, apiKey, secret) {
  const recvWindow = 10000;
  const timestamp = Date.now();
  const queryString = new URLSearchParams(params).toString();
  const signature = signGet(timestamp, apiKey, recvWindow, queryString, secret);
  const url = 'https://api.bybit.com' + path + (queryString ? '?' + queryString : '');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': String(timestamp),
      'X-BAPI-RECV-WINDOW': String(recvWindow),
      'Content-Type': 'application/json',
      'User-Agent': 'Sallam-Wallet-Monitor/1.0'
    },
    cache: 'no-store'
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const apiKey = String(process.env.BYBIT_API_KEY || '').trim();
  const secret = String(process.env.BYBIT_SECRET_KEY || '').trim();

  if (!apiKey || !secret) {
    return res.status(500).json({ ok: false, error: 'BYBIT_CONFIG_ERROR' });
  }

  try {
    const overview = await bybitGet(
      '/v5/asset/asset-overview',
      { valuationCurrency: 'USD' },
      apiKey,
      secret
    );

    if (!overview.ok) {
      return res.status(overview.status || 400).json({ ok: false, error: 'BYBIT_AUTH_OR_BALANCE_FAILED' });
    }

    const body = overview.data;
    if (!body || Number(body.retCode) !== 0 || !body.result) {
      return res.status(400).json({ ok: false, error: 'BYBIT_INVALID_RESPONSE' });
    }

    const totalUsd = Number(body.result.totalEquity || 0);
    return res.status(200).json({
      ok: true,
      totalUsd: Number.isFinite(totalUsd) ? Math.round(totalUsd * 100) / 100 : 0,
      updatedAt: new Date().toISOString()
    });
  } catch {
    return res.status(500).json({ ok: false, error: 'BYBIT_INTERNAL_ERROR' });
  }
};
