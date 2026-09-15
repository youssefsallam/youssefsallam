const RPC_URL = 'https://bsc-dataseed.binance.org/';

const TOKENS = [
  { contract: '0x55d398326f99059ff775485246999027b3197955', decimals: 18, usdPrice: 1 },
  { contract: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18, usdPrice: 1 },
  { contract: '0xc5f0f7b66764f6ec8c8dff7ba683102295e16409', decimals: 18, usdPrice: 1 },
  { contract: '0xe9e7cea3dedca5984780bafc599bd69add087d56', decimals: 18, usdPrice: 1 }
];

async function rpc(method, params) {
  const r = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    cache: 'no-store'
  });
  if (!r.ok) throw new Error('RPC_HTTP');
  const j = await r.json();
  if (j.error) throw new Error('RPC_ERROR');
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
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const address = String((req.query && req.query.address) || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ADDRESS' });
  }

  try {
    const nativeHex = await rpc('eth_getBalance', [address, 'latest']);
    const bnb = hexToNumber(nativeHex, 18);
    const bnbPrice = await getBnbPrice();
    let totalUsd = bnb * bnbPrice;

    for (const token of TOKENS) {
      const balance = await getTokenBalance(address, token);
      if (balance > 0) totalUsd += balance * token.usdPrice;
    }

    return res.status(200).json({
      ok: true,
      totalUsd: Math.round(totalUsd * 100) / 100,
      updatedAt: new Date().toISOString()
    });
  } catch {
    return res.status(500).json({ ok: false, error: 'BSC_INTERNAL_ERROR' });
  }
};
