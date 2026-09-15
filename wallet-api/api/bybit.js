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
  res.setHeader('Cache-Control', 'no-store');

  const plain = String((req.query && req.query.plain) || '') === '1';
  const apiKey = String(process.env.BYBIT_API_KEY || '').trim();
  const secret = String(process.env.BYBIT_SECRET_KEY || '').trim();

  function sendError(code, detail, httpStatus = 500) {
    if (plain) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send('ERR:' + code + (detail ? ':' + String(detail).slice(0, 300) : ''));
    }
    return res.status(httpStatus).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: code,
      detail: detail || null
    });
  }

  if (!apiKey || !secret) {
    return sendError('MISSING_BYBIT_ENV', 'BYBIT_API_KEY or BYBIT_SECRET_KEY missing');
  }

  try {
    const overview = await bybitGet(
      '/v5/asset/asset-overview',
      { valuationCurrency: 'USD' },
      apiKey,
      secret
    );

    if (!overview.ok) {
      return sendError('HTTP_' + overview.status, JSON.stringify(overview.data), overview.status || 400);
    }

    const body = overview.data;
    if (!body || Number(body.retCode) !== 0 || !body.result) {
      const retCode = body && body.retCode != null ? body.retCode : 'UNKNOWN';
      const retMsg = body && body.retMsg ? body.retMsg : JSON.stringify(body);
      return sendError('BYBIT_' + retCode, retMsg, 400);
    }

    const totalUsd = Number(body.result.totalEquity || 0);
    const total = Number.isFinite(totalUsd) ? Math.round(totalUsd * 100) / 100 : 0;
    const list = Array.isArray(body.result.list) ? body.result.list : [];

    if (plain) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(total.toFixed(2));
    }

    return res.status(200).json({
      ok: true,
      region: process.env.VERCEL_REGION || null,
      totalUsd: total,
      accounts: list.map(item => ({
        accountType: item.accountType || null,
        totalEquity: Number(item.totalEquity || 0),
        valuationCurrency: item.valuationCurrency || 'USD'
      })),
      time: body.time || null
    });
  } catch (error) {
    return sendError('EXCEPTION', String(error && error.message ? error.message : error));
  }
};
