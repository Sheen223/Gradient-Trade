export default {
  async fetch(request) {
    // Allow CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, X-PAYMENT-REQUIRED',
          'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE',
        }
      });
    }

    const OG_URL = 'https://llmogevm.opengradient.ai/v1/chat/completions';

    const headers = { 'Content-Type': 'application/json' };
    const xpayment = request.headers.get('X-PAYMENT');
    if (xpayment) headers['X-PAYMENT'] = xpayment;

    const body = await request.text();

    const ogRes = await fetch(OG_URL, {
      method: 'POST',
      headers,
      body,
    });

    // Read the body and ALL headers including X-PAYMENT-REQUIRED
    const resBody = await ogRes.text();
    
    // Build response with explicit CORS + payment headers
    const responseHeaders = {
      'Content-Type': ogRes.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, X-PAYMENT-REQUIRED',
      'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE',
    };

    // Explicitly forward payment headers
    const paymentRequired = ogRes.headers.get('X-PAYMENT-REQUIRED');
    const paymentResponse  = ogRes.headers.get('X-PAYMENT-RESPONSE');
    if (paymentRequired) responseHeaders['X-PAYMENT-REQUIRED'] = paymentRequired;
    if (paymentResponse)  responseHeaders['X-PAYMENT-RESPONSE']  = paymentResponse;

    return new Response(resBody, {
      status: ogRes.status,
      headers: responseHeaders,
    });
  }
};