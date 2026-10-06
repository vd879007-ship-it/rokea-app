const crypto = require('crypto');

const PROJECT_ID = 'rokeya-3ccaa';

// Helper to convert plain JS object into Firestore REST API document format
function wrapFirestoreData(data) {
  const fields = {};
  for (const key in data) {
    const val = data[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'string') {
      fields[key] = { stringValue: val };
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) fields[key] = { integerValue: String(val) };
      else fields[key] = { doubleValue: val };
    } else if (typeof val === 'boolean') {
      fields[key] = { booleanValue: val };
    } else if (Array.isArray(val)) {
      fields[key] = {
        arrayValue: {
          values: val.map(item => {
            if (typeof item === 'object') return { mapValue: { fields: wrapFirestoreData(item) } };
            if (typeof item === 'number') return Number.isInteger(item) ? { integerValue: String(item) } : { doubleValue: item };
            if (typeof item === 'boolean') return { booleanValue: item };
            return { stringValue: String(item) };
          })
        }
      };
    } else if (typeof val === 'object') {
      fields[key] = { mapValue: { fields: wrapFirestoreData(val) } };
    }
  }
  return fields;
}

module.exports = async function handler(req, res) {
  // Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeySecret) {
    console.error('Missing server-side RAZORPAY_KEY_SECRET environment variable.');
    return res.status(500).json({ success: false, error: 'Payment gateway configuration error.' });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      customer,
      items,
      verifiedTotal,
      userId
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required Razorpay payment confirmation parameters.'
      });
    }

    // 1. Authoritative Server-Side Signature Verification
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const providedBuffer = Buffer.from(razorpay_signature, 'utf8');

    const isSignatureValid = expectedBuffer.length === providedBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, providedBuffer);

    if (!isSignatureValid) {
      console.warn(`Payment Signature Mismatch for Order: ${razorpay_order_id}`);
      return res.status(400).json({
        success: false,
        error: 'Payment signature verification failed. Untrusted payment confirmation.'
      });
    }

    // 2. Verified Order Document for Firestore
    const orderDocument = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      paymentStatus: 'PAID',
      verified: true,
      total: parseFloat(verifiedTotal) || 0,
      currency: 'INR',
      customer: {
        name: customer ? customer.name || '' : '',
        phone: customer ? customer.phone || '' : '',
        address: customer ? customer.address || '' : '',
        email: customer ? customer.email || '' : ''
      },
      items: Array.isArray(items) ? items : [],
      userId: userId || 'guest',
      source: 'web_or_app',
      status: 'placed',
      createdAt: new Date().toISOString()
    };

    // 3. Write Authoritative Order directly to Firestore REST API
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/orders`;
    const firestoreRes = await fetch(firestoreUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: wrapFirestoreData(orderDocument) })
    });

    const firestoreResult = await firestoreRes.json();

    if (!firestoreRes.ok) {
      console.error('Firestore Order Write Error:', firestoreResult);
      return res.status(502).json({
        success: false,
        error: 'Payment was verified, but failed to save order record. Please contact support.'
      });
    }

    const firestoreDocId = firestoreResult.name ? firestoreResult.name.split('/').pop() : razorpay_order_id;

    return res.status(200).json({
      success: true,
      message: 'Payment verified and order confirmed successfully.',
      orderId: firestoreDocId,
      paymentId: razorpay_payment_id
    });

  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error verifying payment.' });
  }
};
