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

        // 🔹 Step 1: Get or Create Customer
        console.log("🔍 Fetching customer data...");
        let customerRes = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json?email=${customer_email}`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
        });

        let customer = customerRes.data.customers[0];
        if (!customer) {
            console.log("🚀 Creating new customer...");
            const newCustomerRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json`, {
                customer: {
                    email: customer_email,
                    accepts_marketing: true,
                    tags: "Rewear Revolution"
                }
            }, { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } });

            customer = newCustomerRes.data.customer;
            console.log("✅ New customer created:", customer.id);
        } else {
            console.log("✅ Existing customer found:", customer.id);
        }

        // 🔹 Step 2: Upload images to Shopify
        let uploadedImages = [];

        for (let file of files) {
            console.log(`📤 Requesting upload URL for ${file.originalname}...`);

            // **Request a staged upload URL from Shopify**
            const stagedUploadRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
                query: `
                    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
                        stagedUploadsCreate(input: $input) {
                            stagedTargets {
                                url
                                parameters {
                                    name
                                    value
                                }
                                resourceUrl
                            }
                        }
                    }
                `,
                variables: {
                    input: [{
                        filename: file.originalname,
                        mimeType: file.mimetype,
                        resource: "FILE",
                        httpMethod: "POST"
                    }]
                }
            }, { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } });

            console.log("📡 Shopify Upload Response:", JSON.stringify(stagedUploadRes.data, null, 2));

            const uploadTarget = stagedUploadRes.data.data.stagedUploadsCreate.stagedTargets[0];
            if (!uploadTarget || !uploadTarget.url) {
                console.log("❌ Upload URL not received!");
                return res.status(500).json({ success: false, message: 'Image upload failed' });
            }

            const uploadUrl = uploadTarget.url;
            const uploadParams = uploadTarget.parameters.reduce((acc, param) => {
                acc[param.name] = param.value;
                return acc;
            }, {});

            console.log("📤 Uploading image to Shopify storage...");

            // **Upload file to Shopify’s cloud storage (S3)**
            const imageUploadRes = await axios.post(uploadUrl, file.buffer, {
                headers: {
                    'Content-Type': file.mimetype,
                    ...uploadParams
                }
            });

            if (imageUploadRes.status !== 204) {
                console.log("❌ Image upload failed:", imageUploadRes.statusText);
                return res.status(500).json({ success: false, message: 'Image upload failed' });
            }

            console.log("✅ Image uploaded successfully!");

            uploadedImages.push(uploadTarget.resourceUrl);
        }

        // 🔹 Step 3: Save image URLs to metafields
        console.log("💾 Saving images to Shopify metafields...");
        await axios.put(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers/${customer.id}/metafields.json`, {
            metafield: {
                namespace: 'custom',
                key: 'rewear_images',
                value: JSON.stringify(uploadedImages),
                type: 'json'
            }
        }, { headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN } });

        console.log("✅ Images saved successfully!");
        res.json({ success: true, message: 'Images uploaded successfully!' });

    } catch (error) {
        console.error("❌ Server Error:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Route to fetch images from metafields
app.get('/gallery', async (req, res) => {
    try {
        console.log("🔍 Fetching images for gallery...");
        const response = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
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

        res.json({ success: true, images: galleryImages });
    } catch (error) {
        console.error("❌ Error fetching gallery:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Error retrieving images' });
    }
});

// Start the server
app.listen(3000, () => console.log('🚀 Server running on port 3000'));
