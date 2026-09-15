module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const address = String((req.query && req.query.address) || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return res.status(400).json({ ok: false, error: 'INVALID_ADDRESS' });
  }

  try {
    const base = 'https://web3.binance.com/bapi/defi/v3/public/wallet-direct/buw/wallet/address/pnl/active-position-list';
    const headers = {
      'Accept-Encoding': 'identity',
      'clienttype': 'web',
      'clientversion': '1.2.0',
      'User-Agent': 'binance-web3/1.1 (Skill)'
    };

    let total = 0;
    let offset = 0;
    let pages = 0;
    let items = 0;
    const positions = [];

    for (let page = 0; page < 10; page++) {
      const url = base + '?address=' + encodeURIComponent(address) + '&chainId=56&offset=' + offset;
      const r = await fetch(url, { method: 'GET', headers, cache: 'no-store' });
      const text = await r.text();

      if (!r.ok) {
        return res.status(r.status).json({
          ok: false,
          region: process.env.VERCEL_REGION || null,
          stage: 'binance-web3',
          status: r.status,
          body: text.slice(0, 300)
        });
      }

      let json;
      try { json = JSON.parse(text); }
      catch {
        return res.status(502).json({
          ok: false,
          region: process.env.VERCEL_REGION || null,
          stage: 'json',
          body: text.slice(0, 300)
        });
      }

      if (String(json.code) !== '000000') {
        return res.status(502).json({
          ok: false,
          region: process.env.VERCEL_REGION || null,
          stage: 'api',
          code: json.code,
          message: json.message || null
        });
      }

      const data = json.data || {};
      const list = Array.isArray(data.list)
        ? data.list
        : (Array.isArray(data.activePositionList) ? data.activePositionList : []);

      pages++;
      items += list.length;

      for (const token of list) {
        const price = Number(
          token && token.priceUsd !== undefined ? token.priceUsd :
          token && token.price !== undefined ? token.price : 0
        );

        const qty = Number(
          token && token.quantity !== undefined ? token.quantity :
          token && token.remainQty !== undefined ? token.remainQty : 0
        );

        let usd = 0;

        if (Number.isFinite(price) && Number.isFinite(qty)) {
          usd = price * qty;
        }

        if ((!Number.isFinite(usd) || usd <= 0) && token) {
          const directUsd = Number(
            token.usdValue !== undefined ? token.usdValue :
            token.valueUsd !== undefined ? token.valueUsd :
            token.positionValueUsd !== undefined ? token.positionValueUsd : 0
          );
          if (Number.isFinite(directUsd)) usd = directUsd;
        }

        if (Number.isFinite(usd) && usd >= 0.01) {
          total += usd;
        }

        if (positions.length < 50) {
          positions.push({
            symbol: token && (token.symbol || token.tokenSymbol || token.name) || null,
            price: Number.isFinite(price) ? price : null,
            qty: Number.isFinite(qty) ? qty : null,
            usd: Number.isFinite(usd) ? Math.round(usd * 100) / 100 : null
          });
        }
      }

      if (list.length < 20) break;
      offset += list.length;
    }

    return res.status(200).json({
      ok: true,
      region: process.env.VERCEL_REGION || null,
      address,
      chainId: 56,
      totalUsd: Math.round(total * 100) / 100,
      pages,
      items,
      positions
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      region: process.env.VERCEL_REGION || null,
      error: String(error && error.message ? error.message : error)
    });
  }
};
