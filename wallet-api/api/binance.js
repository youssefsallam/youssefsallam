const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const apiKey = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_SECRET_KEY;

  if (!apiKey || !secret) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: 'MISSING_BINANCE_ENV'
    });
  }

  try {
    const timeResp = await fetch('https://api.binance.com/api/v3/time');
    const timeJson = await timeResp.json();
    const timestamp = Number(timeJson.serverTime || Date.now());

    const params = new URLSearchParams({
      quoteAsset: 'USDT',
      recvWindow: '5000',
      timestamp: String(timestamp)
    });

    const signature = crypto
      .createHmac('sha256', secret)
      .update(params.toString())
      .digest('hex');

    const url =
      'https://api.binance.com/sapi/v1/asset/wallet/balance?' +
      params.toString() +
      '&signature=' + signature;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'User-Agent': 'Sallam-Wallet-Monitor/1.0'
      }
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    return res.status(response.ok ? 200 : response.status).json({
      ok: response.ok,
      region: process.env.VERCEL_REGION || null,
      status: response.status,
      data
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: String(error && error.message ? error.message : error)
    });
  }
};
