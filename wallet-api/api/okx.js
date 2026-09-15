const crypto = require('crypto');

function signOkx(timestamp, method, requestPath, body, secret) {
  const prehash = timestamp + method.toUpperCase() + requestPath + (body || '');
  return crypto.createHmac('sha256', secret).update(prehash).digest('base64');
}

async function okxGet(requestPath, apiKey, secret, passphrase, timestamp) {
  const sign = signOkx(timestamp, 'GET', requestPath, '', secret);
  const r = await fetch('https://www.okx.com' + requestPath, {
    method: 'GET',
    headers: {
      'OK-ACCESS-KEY': apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'Content-Type': 'application/json',
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
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = String(process.env.OKX_API_KEY || '').trim();
  const secret = String(process.env.OKX_SECRET_KEY || '').trim();
  const passphrase = String(process.env.OKX_PASSPHRASE || '').trim();

  if (!apiKey || !secret || !passphrase) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: 'MISSING_OKX_ENV'
    });
  }

  try {
    const timeResp = await fetch('https://www.okx.com/api/v5/public/time', { cache: 'no-store' });
    const timeJson = await timeResp.json();
    const serverMs = Number(timeJson && timeJson.data && timeJson.data[0] && timeJson.data[0].ts) || Date.now();
    const timestamp = new Date(serverMs).toISOString();

    const requestPath = '/api/v5/asset/asset-valuation?ccy=USD';
    const valuation = await okxGet(requestPath, apiKey, secret, passphrase, timestamp);

    if (!valuation.ok) {
      return res.status(valuation.status || 400).json({
        ok: false,
        region: process.env.VERCEL_REGION || null,
        stage: 'asset-valuation',
        status: valuation.status,
        data: valuation.data
      });
    }

    const body = valuation.data;
    if (!body || String(body.code) !== '0' || !Array.isArray(body.data) || !body.data[0]) {
      return res.status(400).json({
        ok: false,
        region: process.env.VERCEL_REGION || null,
        stage: 'asset-valuation',
        data: body
      });
    }

    const item = body.data[0];
    const totalUsd = Number(item.totalBal || 0);

    return res.status(200).json({
      ok: true,
      region: process.env.VERCEL_REGION || null,
      totalUsd: Number.isFinite(totalUsd) ? Math.round(totalUsd * 100) / 100 : 0,
      details: item.details || {},
      ts: item.ts || null
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: String(error && error.message ? error.message : error)
    });
  }
};
