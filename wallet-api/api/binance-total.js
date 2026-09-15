const crypto = require('crypto');

function signQuery(params, secret) {
  const query = new URLSearchParams(params).toString();
  const signature = crypto.createHmac('sha256', secret).update(query).digest('hex');
  return query + '&signature=' + signature;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  const apiKey = String(process.env.BINANCE_API_KEY || '').trim();
  const secret = String(process.env.BINANCE_SECRET_KEY || '').trim();

  if (!apiKey || !secret) {
    return res.status(500).send('ERROR');
  }

  try {
    const timeResp = await fetch('https://api.binance.com/api/v3/time', { cache: 'no-store' });
    const timeJson = await timeResp.json();
    const timestamp = Number(timeJson.serverTime || Date.now());

    const params = {
      quoteAsset: 'USDT',
      recvWindow: '10000',
      timestamp: String(timestamp)
    };

    const signed = signQuery(params, secret);
    const response = await fetch(
      'https://api.binance.com/sapi/v1/asset/wallet/balance?' + signed,
      {
        method: 'GET',
        headers: {
          'X-MBX-APIKEY': apiKey,
          'User-Agent': 'Sallam-Wallet-Monitor/1.0'
        },
        cache: 'no-store'
      }
    );

    const data = await response.json();
    if (!response.ok || !Array.isArray(data)) {
      return res.status(response.status || 500).send('ERROR');
    }

    const total = data.reduce((sum, wallet) => {
      const balance = Number(wallet && wallet.balance ? wallet.balance : 0);
      return sum + (Number.isFinite(balance) ? balance : 0);
    }, 0);

    return res.status(200).send(total.toFixed(2));
  } catch (error) {
    return res.status(500).send('ERROR');
  }
};
