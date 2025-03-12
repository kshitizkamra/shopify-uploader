require('dotenv').config();
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
const FormData = require('form-data');

const app = express();
app.use(express.json());
app.use(cors());

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Route to upload images and save to metafields
app.post('/upload', upload.array('photos', 3), async (req, res) => {
    try {
        console.log("✅ Received request body:", req.body);
        console.log("✅ Received files:", req.files);

        const { customer_email, customer_name, caption } = req.body;
        const files = req.files;

        if (!customer_email || !files.length) {
            console.log("❌ Error: Missing email or images");
            return res.status(400).json({ success: false, message: 'Missing email or images' });
        }

        // 🔹 Step 1: Check if customer exists
        console.log("🔍 Fetching customer data...");
        let customerRes = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json?email=${customer_email}`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
        });

        let customer = customerRes.data.customers[0];

        // If customer not found, create a new one
        if (!customer) {
            console.log("⚠️ Customer not found, creating new customer...");
            const createCustomerRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json`, {
                customer: {
                    first_name: customer_name || "New",
                    email: customer_email,
                    verified_email: true
                }
            }, {
                headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
            });

            customer = createCustomerRes.data.customer;
            console.log("✅ New customer created:", customer.id);
        } else {
            console.log("✅ Existing customer found:", customer.id);
        }

        // 🔹 Step 2: Upload images to Shopify
        let uploadedImages = [];
        for (let file of files) {
            console.log(`📤 Uploading ${file.originalname}...`);
            let fileBase64 = file.buffer.toString('base64');

            // Request a pre-signed upload URL from Shopify
            const graphqlQuery = {
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
            };

            try {
                const uploadRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, graphqlQuery, {
                    headers: {
                        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                        'Content-Type': 'application/json'
                    }
                });

                console.log("📡 Full Shopify Response:", JSON.stringify(uploadRes.data, null, 2));

                const stagedTarget = uploadRes.data.data?.stagedUploadsCreate?.stagedTargets[0];

                if (!stagedTarget || !stagedTarget.url) {
                    console.error("❌ Shopify did not return an upload URL!");
                    return res.status(500).json({ success: false, message: 'Image upload failed (No URL from Shopify)' });
                }

                // Upload file to Shopify's storage
                const uploadForm = new FormData();
                stagedTarget.parameters.forEach(param => uploadForm.append(param.name, param.value));
                uploadForm.append('file', file.buffer, file.originalname);

                const fileUploadRes = await axios.post(stagedTarget.url, uploadForm, {
                    headers: { ...uploadForm.getHeaders() }
                });

                console.log("📤 Image Upload Response:", fileUploadRes.status, fileUploadRes.statusText);

                if (fileUploadRes.status !== 204) {
                    console.error("❌ Image upload failed at Shopify S3 bucket");
                    return res.status(500).json({ success: false, message: 'Image upload failed (S3 error)' });
                }

                uploadedImages.push(stagedTarget.resourceUrl);
                console.log("✅ Image uploaded successfully:", stagedTarget.resourceUrl);

            } catch (uploadError) {
                console.error("❌ Upload Error:", uploadError.response?.data || uploadError.message);
                return res.status(500).json({ success: false, message: 'Image upload failed' });
            }
        }

        // 🔹 Step 3: Save image URLs to customer metafields
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

// Fetch Gallery Images
app.get('/gallery', async (req, res) => {
    try {
        console.log("📸 Fetching gallery images...");

        // Fetch all customers
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

        console.log("✅ Gallery images fetched successfully!");
        res.json({ success: true, images: galleryImages });

    } catch (error) {
        console.error("❌ Error fetching gallery:", error);
        res.status(500).json({ success: false, message: 'Error retrieving images' });
    }
});

// Start the server
app.listen(3000, () => console.log('🚀 Server running on port 3000'));
