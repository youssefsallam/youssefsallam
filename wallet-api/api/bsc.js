const RPC_URL = 'https://bsc-dataseed.binance.org/';

const TOKENS = [
  { symbol: 'USDT', contract: '0x55d398326f99059ff775485246999027b3197955', decimals: 18, usdPrice: 1 },
  { symbol: 'USDC', contract: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18, usdPrice: 1 },
  { symbol: 'FDUSD', contract: '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409', decimals: 18, usdPrice: 1 },
  { symbol: 'BUSD', contract: '0xe9e7cea3dedca5984780bafc599bd69add087d56', decimals: 18, usdPrice: 1 }
];

async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store'
  });
  if (!r.ok) throw new Error('RPC HTTP ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'RPC error');
  return j.result;
}

function hexToNumber(hex, decimals) {
  if (!hex || hex === '0x') return 0;
  const raw = BigInt(hex);
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = raw % base;
  return Number(whole) + Number(frac) / Number(base);
}

function balanceOfData(address) {
  return '0x70a08231' + address.replace(/^0x/, '').padStart(64, '0');
}

async function getTokenBalance(address, token) {
  const result = await rpc('eth_call', [
    { to: token.contract, data: balanceOfData(address) },
    'latest'
  ]);
  return hexToNumber(result, token.decimals);
}

async function getBnbPrice() {
  const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', { cache: 'no-store' });
  if (!r.ok) return 0;
  const j = await r.json();
  const p = Number(j.price || 0);
  return Number.isFinite(p) ? p : 0;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const address = String((req.query && req.query.address) || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ADDRESS' });
  }

  try {
    const nativeHex = await rpc('eth_getBalance', [address, 'latest']);
    const bnb = hexToNumber(nativeHex, 18);
    const bnbPrice = await getBnbPrice();

    const assets = [];
    let totalUsd = bnb * bnbPrice;

    if (bnb > 0) {
      assets.push({ symbol: 'BNB', balance: bnb, price: bnbPrice, usd: bnb * bnbPrice });
    }

    for (const token of TOKENS) {
      const balance = await getTokenBalance(address, token);
      if (balance > 0) {
        const usd = balance * token.usdPrice;
        totalUsd += usd;
        assets.push({ symbol: token.symbol, balance, price: token.usdPrice, usd });
      }
    }

    return res.status(200).json({
      ok: true,
      region: process.env.VERCEL_REGION || null,
      source: 'BSC-RPC',
      address,
      chainId: 56,
      totalUsd: Math.round(totalUsd * 100) / 100,
      assets: assets.map(a => ({
        symbol: a.symbol,
        balance: Math.round(a.balance * 1e8) / 1e8,
        price: Math.round(a.price * 1e8) / 1e8,
        usd: Math.round(a.usd * 100) / 100
      }))
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: String(error && error.message ? error.message : error)
    });
  }
};
