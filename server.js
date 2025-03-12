require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Shopify API credentials
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Route to upload images and save to metafields
app.post('/upload', upload.array('photos', 3), async (req, res) => {
    try {
        const { customer_email, caption } = req.body;
        const files = req.files;

        if (!customer_email || !files.length) {
            return res.status(400).json({ success: false, message: 'Missing email or images' });
        }

        // Get customer by email
        const customerRes = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2023-04/customers.json?email=${customer_email}`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
        });

        const customer = customerRes.data.customers[0];
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }

        // Upload images to Shopify Files API
        let uploadedImages = [];
        for (let file of files) {
            let fileBase64 = file.buffer.toString('base64');
            const uploadRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2023-04/graphql.json`, {
                query: `
                  mutation {
                    stagedUploadsCreate(input: [{filename: "${file.originalname}", mimeType: "${file.mimetype}"}]) {
                      stagedTargets {
                        url
                        resourceUrl
                      }
                    }
                  }
                `
            }, { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } });

            let uploadUrl = uploadRes.data.data.stagedUploadsCreate.stagedTargets[0].resourceUrl;
            uploadedImages.push(uploadUrl);
        }

        // Save uploaded image URLs to metafields
        await axios.put(`https://${SHOPIFY_STORE}/admin/api/2023-04/customers/${customer.id}/metafields.json`, {
            metafield: {
                namespace: 'custom',
                key: 'rewear_images',
                value: JSON.stringify(uploadedImages),
                type: 'json'
            }
        }, { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } });

        res.json({ success: true, message: 'Images uploaded successfully!' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start the server
app.listen(3000, () => console.log('Server running on port 3000'));
