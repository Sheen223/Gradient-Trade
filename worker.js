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

    // Read body ONCE and reuse
    const bodyText = await request.text();

    // Forward all relevant headers to OpenGradient
    const reqHeaders = { 'Content-Type': 'application/json' };
    const xPayment     = request.headers.get('X-PAYMENT');
    const xSettlement  = request.headers.get('X-SETTLEMENT-TYPE');
    if (xPayment)    reqHeaders['X-PAYMENT']         = xPayment;
    if (xSettlement) reqHeaders['X-SETTLEMENT-TYPE'] = xSettlement;

    const ogRes = await fetch(OG_URL, {
      method: 'POST',
      headers: reqHeaders,
      body: bodyText,
    });

    // Read response body
    const resBody = await ogRes.text();

    // Build CORS headers + forward payment headers
    const resHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE',
    };

    const xPayReq = ogRes.headers.get('X-PAYMENT-REQUIRED') || ogRes.headers.get('x-payment-required');
    const xPayRes = ogRes.headers.get('X-PAYMENT-RESPONSE')  || ogRes.headers.get('x-payment-response');
    if (xPayReq) resHeaders['X-PAYMENT-REQUIRED'] = xPayReq;
    if (xPayRes) resHeaders['X-PAYMENT-RESPONSE']  = xPayRes;

    // If 402 and body is empty, add debug info
    if (ogRes.status === 402 && (!resBody || resBody === '{}' || resBody === '')) {
      return new Response(JSON.stringify({ 
        error: 'Payment required',
        xPaymentRequired: xPayReq || 'not found in headers',
        rawBody: resBody 
      }), { status: 402, headers: resHeaders });
    }

    return new Response(resBody, {
      status: ogRes.status,
      headers: resHeaders,
    });
  }
};
