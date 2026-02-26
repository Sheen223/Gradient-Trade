export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-PAYMENT, X-PAYMENT-REQUIRED',
          'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE, X-Debug-Headers',
        }
      });
    }

    const OG_URL = 'https://llmogevm.opengradient.ai/v1/chat/completions';

    const headers = { 'Content-Type': 'application/json' };
    const xpayment = request.headers.get('X-PAYMENT');
    if (xpayment) headers['X-PAYMENT'] = xpayment;

    const body = await request.text();

    const ogRes = await fetch(OG_URL, { method: 'POST', headers, body });

    const resBody = await ogRes.text();

    // Collect ALL headers OpenGradient sent back for debugging
    const allHeaders = {};
    ogRes.headers.forEach((value, key) => { allHeaders[key] = value; });

    const responseHeaders = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-PAYMENT-REQUIRED, X-PAYMENT-RESPONSE, X-Debug-Headers',
      'X-Debug-Headers': JSON.stringify(allHeaders),
    };

    // Forward payment headers under multiple possible casings
    const headerVariants = [
      'X-PAYMENT-REQUIRED', 'x-payment-required', 'X-Payment-Required',
      'X-PAYMENT-RESPONSE', 'x-payment-response', 'X-Payment-Response',
      'www-authenticate', 'WWW-Authenticate',
    ];
    headerVariants.forEach(h => {
      const val = ogRes.headers.get(h);
      if (val) responseHeaders[h] = val;
    });

    return new Response(resBody, {
      status: ogRes.status,
      headers: responseHeaders,
    });
  }
};
