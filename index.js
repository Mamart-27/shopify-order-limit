const express = require('express');
const axios = require('axios');
const getRawBody = require('raw-body');
const app = express();
const PORT = process.env.PORT || 3000;

// Replace with your values
const SHOP = 'your-store.myshopify.com';
const ADMIN_API_TOKEN = 'shpat_your_admin_api_token';
const PRODUCT_ID = '1234567890'; // The product ID you want to restrict
const MAX_LIMIT = 2;

app.post('/webhook/orders-create', async (req, res) => {
  const body = await getRawBody(req);
  const order = JSON.parse(body.toString());

  try {
    const shippingAddress = order.shipping_address;
    const lineItems = order.line_items;

    // Check if restricted product is in this order
    const restrictedItem = lineItems.find(item => item.product_id == PRODUCT_ID);
    if (!restrictedItem) {
      return res.status(200).send('No restricted product. Skipping.');
    }

    // Search past orders with the same shipping address
    const addressQuery = `${shippingAddress.address1} ${shippingAddress.zip}`;
    const response = await axios.get(`https://${SHOP}/admin/api/2024-04/orders.json`, {
      headers: {
        'X-Shopify-Access-Token': ADMIN_API_TOKEN
      },
      params: {
        status: 'any',
        fields: 'line_items,shipping_address',
        limit: 250
      }
    });

    let totalQuantity = restrictedItem.quantity;

    response.data.orders.forEach(pastOrder => {
      const addr = pastOrder.shipping_address;
      const sameAddress =
        addr.address1 === shippingAddress.address1 &&
        addr.zip === shippingAddress.zip;

      if (sameAddress) {
        pastOrder.line_items.forEach(item => {
          if (item.product_id == PRODUCT_ID) {
            totalQuantity += item.quantity;
          }
        });
      }
    });

    if (totalQuantity > MAX_LIMIT) {
      // Cancel the new order
      await axios.post(`https://${SHOP}/admin/api/2024-04/orders/${order.id}/cancel.json`, {
        reason: "other",
        email: true,
        restock: true
      }, {
        headers: {
          'X-Shopify-Access-Token': ADMIN_API_TOKEN,
          'Content-Type': 'application/json'
        }
      });

      console.log(`Order ${order.id} canceled for exceeding product limit.`);
    }

    res.status(200).send('Processed');
  } catch (error) {
    console.error('Error handling webhook:', error);
    res.status(500).send('Error');
  }
});

app.listen(PORT, () => console.log(`Webhook server running on port ${PORT}`));
