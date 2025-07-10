import axios from 'axios';
import getRawBody from 'raw-body';

const SHOP = process.env.SHOP;
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;
const PRODUCT_ID = process.env.PRODUCT_ID;
const MAX_LIMIT = 2;

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = await getRawBody(req);
  const order = JSON.parse(body.toString());

  try {
    const shippingAddress = order.shipping_address;
    const lineItems = order.line_items;

    const restrictedItem = lineItems.find(item => item.product_id == PRODUCT_ID);
    if (!restrictedItem) return res.status(200).send('No restricted item in order.');

    const response = await axios.get(`https://${SHOP}/admin/api/2024-04/orders.json`, {
      headers: { 'X-Shopify-Access-Token': ADMIN_API_TOKEN },
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

      console.log(`Order ${order.id} canceled for exceeding limit.`);
    }

    res.status(200).send('Processed');
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).send('Internal Error');
  }
}
