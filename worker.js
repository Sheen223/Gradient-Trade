export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, X-SETTLEMENT-TYPE',
          'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE',
        }
      });
    }

    const OG_URL = 'https://llm.opengradient.ai/v1/chat/completions';

    const reqHeaders = { 'Content-Type': 'application/json' };
    const xpayment = request.headers.get('X-PAYMENT');
    if (xpayment) reqHeaders['X-PAYMENT'] = xpayment;

    const body = await request.text();

    const ogRes = await fetch(OG_URL, {
      method: 'POST',
      headers: reqHeaders,
      body,
    });

    const resBody = await ogRes.text();

    // Build response headers explicitly
    const resHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE',
      'Content-Type': ogRes.headers.get('Content-Type') || 'application/json',
    };

    // Forward payment headers
    const xPayReq = ogRes.headers.get('X-PAYMENT-REQUIRED') || ogRes.headers.get('x-payment-required');
    const xPayRes = ogRes.headers.get('X-PAYMENT-RESPONSE') || ogRes.headers.get('x-payment-response');
    if (xPayReq) resHeaders['X-PAYMENT-REQUIRED'] = xPayReq;
    if (xPayRes) resHeaders['X-PAYMENT-RESPONSE']  = xPayRes;

    return new Response(resBody, {
      status: ogRes.status,
      headers: resHeaders,
    });
  }
};

