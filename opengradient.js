// ── OPENGRADIENT x402 SIGNAL ENGINE ──
const OG_ENDPOINT  = 'https://spring-thunder-53b1.nsomiari.workers.dev';
const OG_CHAIN_ID  = 84532;
const OPG_TOKEN    = '0x240b09731D96979f50B2C649C9CE10FcF9C7987F';
const OPG_PAY_TO   = '0x339c7de83d1a62edafbaac186382ee76584d294f';

async function ensureBaseSepoliaNetwork() {
  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x14A34' }],
  }).catch(async (err) => {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x14A34',
          chainName: 'Base Sepolia',
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://sepolia.base.org'],
          blockExplorerUrls: ['https://sepolia.basescan.org'],
        }]
      });
    }
  });
}

function buildPrompt(coinName, symbol, price, change24h, timeframe) {
  return `You are a professional crypto trading signal AI. Analyze the following market data and return a trading signal.

Coin: ${coinName} (${symbol})
Current Price: $${price.toLocaleString()}
24h Change: ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%
Timeframe: ${timeframe}

Based on this data, respond ONLY with a JSON object in this exact format, no other text:
{
  "signal": "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell",
  "confidence": <number between 50 and 95>,
  "reason": "<one sentence explanation under 20 words>"
}`;
}

export async function getAISignal(coinName, symbol, price, change24h, timeframe) {
  if (!window.ethereum) {
    console.warn('[OG] No wallet detected');
    return null;
  }

  try {
    console.log('[OG] Step 1 — Switching to Base Sepolia...');
    await ensureBaseSepoliaNetwork();
    console.log('[OG] Step 1 — Network OK');

    console.log('[OG] Step 2 — Requesting accounts...');
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const userAddress = accounts[0];
    console.log('[OG] Step 2 — Address:', userAddress);

    const requestBody = {
      model: 'openai/gpt-4o',
      messages: [
        { role: 'system', content: 'You are a crypto trading signal AI. Always respond with valid JSON only.' },
        { role: 'user',   content: buildPrompt(coinName, symbol, price, change24h, timeframe) }
      ],
      max_tokens: 100,
      temperature: 0.3,
    };

    console.log('[OG] Step 3 — Initial request via Cloudflare Worker...');
    const initRes = await fetch(OG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    console.log('[OG] Step 3 — Status:', initRes.status);

    if (initRes.status !== 402) {
      const data = await initRes.json();
      return parseSignal(data);
    }

    // Read payment requirements — from header first, then body
    let paymentReqs = null;
    const paymentHeader = initRes.headers.get('X-PAYMENT-REQUIRED');
    if (paymentHeader) {
      paymentReqs = JSON.parse(atob(paymentHeader));
      console.log('[OG] Step 4 — Got payment reqs from header');
    } else {
      const body402 = await initRes.json();
      console.log('[OG] Step 4 — 402 body:', JSON.stringify(body402).slice(0, 200));
      const accepts = body402.accepts || [];
      paymentReqs = accepts[0] || {};
    }

    console.log('[OG] Step 4 — Payment reqs:', JSON.stringify(paymentReqs).slice(0, 200));

    const amount  = paymentReqs.maxAmountRequired || '1000000';
    const payTo   = paymentReqs.payTo   || OPG_PAY_TO;
    const asset   = paymentReqs.asset   || OPG_TOKEN;

    console.log('[OG] Step 4 — Amount:', amount, '| PayTo:', payTo);

    const nonce       = '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
    const validAfter  = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 300;

    // EIP-712 domain — exactly as per docs
    const domain = {
      name:              'OPG',
      version:           '1',
      chainId:           OG_CHAIN_ID,
      verifyingContract: asset,
    };

    const types = {
      TransferWithAuthorization: [
        { name: 'from',        type: 'address' },
        { name: 'to',          type: 'address' },
        { name: 'value',       type: 'uint256' },
        { name: 'validAfter',  type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce',       type: 'bytes32' },
      ]
    };

    const message = {
      from:        userAddress,
      to:          payTo,
      value:       amount,
      validAfter:  validAfter,
      validBefore: validBefore,
      nonce:       nonce,
    };

    console.log('[OG] Step 5 — Requesting EIP-712 signature from Rabby...');
    const signature = await window.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [userAddress, JSON.stringify({ domain, types, primaryType: 'TransferWithAuthorization', message })],
    });
    console.log('[OG] Step 5 — Signed!');

    // X-PAYMENT format — exactly as per docs: just payload with signature + authorization
    const xPayment = btoa(JSON.stringify({
      payload: {
        signature,
        authorization: {
          from:        userAddress,
          to:          payTo,
          value:       amount,
          validAfter:  validAfter,
          validBefore: validBefore,
          nonce:       nonce,
        }
      }
    }));

    console.log('[OG] Step 6 — Submitting paid request...');
    const paidRes = await fetch(OG_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PAYMENT': xPayment,
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[OG] Step 6 — Status:', paidRes.status);
    const paidBody = await paidRes.json();
    console.log('[OG] Step 6 — Body:', JSON.stringify(paidBody).slice(0, 300));

    if (!paidRes.ok) {
      throw new Error(paidBody.error?.message || JSON.stringify(paidBody));
    }

    console.log('[OG] Done!');
    return parseSignal(paidBody);

  } catch (err) {
    console.error('[OG] FAILED:', err.message);
    return null;
  }
}

function parseSignal(data) {
  try {
    const text   = data.choices[0].message.content.trim();
    const clean  = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    console.log('[OG] Signal:', parsed);
    return {
      signal:     parsed.signal     || 'Hold',
      confidence: parsed.confidence || 70,
      reason:     parsed.reason     || '',
      signalType: getSignalType(parsed.signal),
    };
  } catch (e) {
    console.warn('[OG] Parse failed:', e);
    return null;
  }
}

function getSignalType(signal) {
  if (!signal) return 'hold';
  const s = signal.toLowerCase();
  if (s.includes('strong buy'))  return 'buy';
  if (s.includes('buy'))         return 'buy';
  if (s.includes('strong sell')) return 'sell';
  if (s.includes('sell'))        return 'sell';
  return 'hold';
}
