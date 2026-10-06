const crypto = require('crypto');

const PROJECT_ID = 'rokeya-3ccaa';

// Helper to unwrap Firestore REST API data types
function unwrapFirestoreData(fields) {
  if (!fields) return {};
  const data = {};
  for (const key in fields) {
    const val = fields[key];
    if (val.stringValue !== undefined) data[key] = val.stringValue;
    else if (val.integerValue !== undefined) data[key] = parseInt(val.integerValue, 10);
    else if (val.doubleValue !== undefined) data[key] = parseFloat(val.doubleValue);
    else if (val.booleanValue !== undefined) data[key] = val.booleanValue;
    else if (val.arrayValue !== undefined) {
      data[key] = val.arrayValue.values ? val.arrayValue.values.map(v => v.stringValue || v.integerValue || v.doubleValue) : [];
    } else if (val.mapValue !== undefined) {
      data[key] = unwrapFirestoreData(val.mapValue.fields);
    }
  }
  return data;
}

// Fetch single product from Firestore REST API
async function getAuthoritativeProduct(idOrSlug) {
  try {
    // 1. Try document ID
    const docRes = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/products/${idOrSlug}`);
    if (docRes.ok) {
      const doc = await docRes.json();
      const data = unwrapFirestoreData(doc.fields);
      data.id = doc.name.split('/').pop();
      return data;
    }

    // 2. Try querying by slug or numeric ID field
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'products' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'slug' },
            op: 'EQUAL',
            value: { stringValue: String(idOrSlug) }
          }
        },
        limit: 1
      }
    };

    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, {
      method: 'POST',
      body: JSON.stringify(query),
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await res.json();
    if (result && result.length > 0 && result[0].document) {
      const doc = result[0].document;
      const data = unwrapFirestoreData(doc.fields);
      data.id = doc.name.split('/').pop();
      return data;
    }
  } catch (error) {
    console.error('Firestore product lookup error:', error);
  }
  return null;
}

// Extract numeric price from product data or description
function extractAuthoritativePrice(prod) {
  if (prod.price && !isNaN(parseFloat(prod.price))) {
    return Math.round(parseFloat(prod.price));
  }
  if (prod.description) {
    const match = prod.description.match(/(?:price|₹|rs\.?|inr)\s*[:=-]?\s*₹?\s*([\d,]+)/i);
    if (match && match[1]) {
      const p = parseInt(match[1].replace(/,/g, ''), 10);
      if (!isNaN(p) && p > 0) return p;
    }
  }
  return 0;
}

module.exports = async function handler(req, res) {
  // Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret) {
    console.error('Missing server-side Razorpay credentials (RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET).');
    return res.status(500).json({ success: false, error: 'Payment gateway configuration error.' });
  }

  try {
    const { items, customer, userId } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Cart is empty or invalid items payload.' });
    }

    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({ success: false, error: 'Customer name and contact number are required.' });
    }

    // Authoritative Server-Side Price Verification
    let verifiedTotalAmount = 0;
    const verifiedItems = [];

    for (const item of items) {
      const prodId = item.id || item.slug;
      if (!prodId) continue;

      const authoritativeProduct = await getAuthoritativeProduct(prodId);
      if (!authoritativeProduct) {
        return res.status(400).json({
          success: false,
          error: `Product not found: ${item.name || prodId}`
        });
      }

      const verifiedPrice = extractAuthoritativePrice(authoritativeProduct);
      if (verifiedPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid product price for: ${authoritativeProduct.name || prodId}`
        });
      }

      const quantity = Math.max(1, parseInt(item.quantity || 1, 10));
      verifiedTotalAmount += (verifiedPrice * quantity);

      verifiedItems.push({
        id: authoritativeProduct.id,
        name: authoritativeProduct.name || item.name || 'Saree / Jewellery Item',
        price: verifiedPrice,
        quantity: quantity,
        image: authoritativeProduct.image || authoritativeProduct.img || item.image || ''
      });
    }

    if (verifiedTotalAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Calculated order total is zero.' });
    }

    // Create Order with Razorpay API (Server-Side)
    const authHeader = 'Basic ' + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64');
    const orderPayload = {
      amount: Math.round(verifiedTotalAmount * 100), // in paise
      currency: 'INR',
      receipt: `rcpt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      notes: {
        customerName: String(customer.name).slice(0, 40),
        customerPhone: String(customer.phone).slice(0, 20),
        userId: String(userId || 'guest').slice(0, 50),
        itemCount: String(verifiedItems.length)
      }
    };

    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderPayload)
    });

    const rzpOrder = await rzpRes.json();

    if (!rzpRes.ok || !rzpOrder.id) {
      console.error('Razorpay Order Creation Failed:', rzpOrder);
      return res.status(502).json({
        success: false,
        error: rzpOrder.error ? rzpOrder.error.description : 'Failed to initialize payment gateway order.'
      });
    }

    return res.status(200).json({
      success: true,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: razorpayKeyId,
      verifiedTotal: verifiedTotalAmount,
      items: verifiedItems
    });

  } catch (error) {
    console.error('Order creation endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error while creating payment order.' });
  }
};
