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
        console.log("✅ Received request body:", req.body);
        console.log("✅ Received files:", req.files);

        const { customer_email, caption } = req.body;
        const files = req.files;

        if (!customer_email || !files.length) {
            console.log("❌ Error: Missing email or images");
            return res.status(400).json({ success: false, message: 'Missing email or images' });
        }

        let customerId;

        // 🔹 Step 1: Check if customer exists by email
        console.log("🔍 Fetching customer data...");
        const customerRes = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json?email=${customer_email}`, {
            headers: { 
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        const existingCustomer = customerRes.data.customers[0];

        if (existingCustomer) {
            console.log("✅ Existing customer found:", existingCustomer.id);
            customerId = existingCustomer.id;
        } else {
            console.log("⚡ Customer not found, creating new customer...");

            // 🔹 Step 2: Create a new customer if not found
            const newCustomerRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json`, {
                customer: {
                    email: customer_email,
                    accepts_marketing: true
                }
            }, {
                headers: { 
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            });

            customerId = newCustomerRes.data.customer.id;
            console.log("✅ New customer created:", customerId);
        }

        // 🔹 Step 3: Upload images to Shopify
        let uploadedImages = [];
        for (let file of files) {
            console.log(`📤 Uploading ${file.originalname}...`);
            let fileBase64 = file.buffer.toString('base64');

            const uploadRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
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
            }, { 
                headers: { 
                    'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                    'Content-Type': 'application/json'
                }
            });

            console.log("✅ Upload Response:", JSON.stringify(uploadRes.data, null, 2));
            let uploadUrl = uploadRes.data.data.stagedUploadsCreate.stagedTargets[0].resourceUrl;
            uploadedImages.push(uploadUrl);
        }

        // 🔹 Step 4: Save image URLs to metafields
        console.log("💾 Saving images to Shopify metafields...");
        await axios.put(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customerId}/metafields.json`, {
            metafield: {
                namespace: 'custom',
                key: 'rewear_images',
                value: JSON.stringify(uploadedImages),
                type: 'json'
            }
        }, { 
            headers: { 
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        console.log("✅ Images saved successfully!");
        res.json({ success: true, message: 'Images uploaded successfully!' });

    } catch (error) {
        console.error("❌ Full Error Response:", JSON.stringify(error.response?.data, null, 2) || error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// 🔹 Route to fetch gallery images
app.get('/gallery', async (req, res) => {
    try {
        console.log("🔍 Fetching customer images from metafields...");

        // Fetch all customers
        const response = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json`, {
            headers: { 
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        let galleryImages = [];
        response.data.customers.forEach(customer => {
            if (customer.metafields) {
                let imageMetafield = customer.metafields.find(mf => mf.key === 'rewear_images');
                if (imageMetafield) {
                    let images = JSON.parse(imageMetafield.value);
                    galleryImages.push(...images);
                }
            }
        });

        console.log("✅ Gallery images fetched successfully!");
        res.json({ success: true, images: galleryImages });

    } catch (error) {
        console.error("❌ Error fetching gallery:", JSON.stringify(error.response?.data, null, 2) || error.message);
        res.status(500).json({ success: false, message: 'Error retrieving images' });
    }
});

// Start the server
app.listen(3000, () => console.log('🚀 Server running on port 3000'));
