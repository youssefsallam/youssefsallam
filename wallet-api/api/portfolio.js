module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const address = String((req.query && req.query.address) || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ADDRESS' });
  }

  try {
    const holdingsUrl =
      'https://api.routescan.io/v2/network/mainnet/evm/56/address/' +
      encodeURIComponent(address) +
      '/erc20-holdings?limit=100';

    const gasUrl =
      'https://api.routescan.io/v2/network/mainnet/evm/56/address/' +
      encodeURIComponent(address) +
      '/gas-balance?limit=25';

    const [holdingsResp, gasResp, bnbPriceResp] = await Promise.all([
      fetch(holdingsUrl, { cache: 'no-store' }),
      fetch(gasUrl, { cache: 'no-store' }),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', { cache: 'no-store' })
    ]);

    if (!holdingsResp.ok) {
      return res.status(502).json({ ok: false, stage: 'routescan-holdings', status: holdingsResp.status });
    }
    if (!gasResp.ok) {
      return res.status(502).json({ ok: false, stage: 'routescan-gas', status: gasResp.status });
    }
    if (!bnbPriceResp.ok) {
      return res.status(502).json({ ok: false, stage: 'bnb-price', status: bnbPriceResp.status });
    }

    const holdings = await holdingsResp.json();
    const gas = await gasResp.json();
    const bnbPriceJson = await bnbPriceResp.json();

    const tokenItems = Array.isArray(holdings && holdings.items) ? holdings.items : [];
    const gasItems = Array.isArray(gas && gas.items) ? gas.items : [];

    let erc20Usd = 0;
    const positions = [];

    for (const token of tokenItems) {
      const usd = Number(token && token.tokenValueInUsd != null ? token.tokenValueInUsd : 0);
      const qtyRaw = token && token.tokenQuantity != null ? String(token.tokenQuantity) : '0';
      const decimals = Number(token && token.tokenDecimals != null ? token.tokenDecimals : 0);
      let qty = Number(qtyRaw);
      if (Number.isFinite(qty) && Number.isFinite(decimals) && decimals > 0) {
        qty = qty / Math.pow(10, decimals);
      }

      if (Number.isFinite(usd) && usd >= 0.01) {
        erc20Usd += usd;
        positions.push({
          symbol: token.tokenSymbol || null,
          tokenAddress: token.tokenAddress || null,
          qty: Number.isFinite(qty) ? qty : null,
          price: token.tokenPrice != null ? Number(token.tokenPrice) : null,
          usd: Math.round(usd * 100) / 100
        });
      }
    }

    const gasItem = gasItems.find(x => String(x && x.chainId) === '56') || gasItems[0] || null;
    const wei = gasItem ? Number(gasItem.balance || 0) : 0;
    const bnb = Number.isFinite(wei) ? wei / 1e18 : 0;
    const bnbPrice = Number(bnbPriceJson && bnbPriceJson.price || 0);
    const bnbUsd = Number.isFinite(bnb) && Number.isFinite(bnbPrice) ? bnb * bnbPrice : 0;

    if (bnbUsd >= 0.01) {
      positions.push({ symbol: 'BNB', tokenAddress: null, qty: bnb, price: bnbPrice, usd: Math.round(bnbUsd * 100) / 100 });
    }

    positions.sort((a, b) => (b.usd || 0) - (a.usd || 0));

    const totalUsd = erc20Usd + bnbUsd;

    return res.status(200).json({
      ok: true,
      region: process.env.VERCEL_REGION || null,
      source: 'Routescan + Binance BNB price',
      address,
      chainId: 56,
      totalUsd: Math.round(totalUsd * 100) / 100,
      erc20Usd: Math.round(erc20Usd * 100) / 100,
      bnbUsd: Math.round(bnbUsd * 100) / 100,
      positions: positions.slice(0, 30)
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: String(error && error.message ? error.message : error)
    });
  }
};
