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

        const { customer_email, customer_name, caption } = req.body;
        const files = req.files;

        if (!customer_email || !customer_name || !files.length) {
            console.log("❌ Error: Missing email, name, or images");
            return res.status(400).json({ success: false, message: 'Missing email, name, or images' });
        }

        // 🔹 Step 1: Get customer by email
        console.log("🔍 Fetching customer data...");
        let customerRes = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json?email=${customer_email}`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
        });

        let customer = customerRes.data.customers[0];

        // 🔹 Step 2: Create customer if not found
        if (!customer) {
            console.log("⚡ Customer not found, creating a new one...");
            let newCustomerRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json`, {
                customer: {
                    first_name: customer_name,
                    email: customer_email,
                    verified_email: true
                }
            }, {
                headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
            });

            customer = newCustomerRes.data.customer;
            console.log("✅ New customer created:", customer.id);
        } else {
            console.log("✅ Existing customer found:", customer.id);
        }

        // 🔹 Step 3: Upload images to Shopify
        let uploadedImages = [];

for (let file of files) {
    console.log(`📤 Uploading ${file.originalname}...`);

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
        // 🔹 Step 3.1: Request a pre-signed upload URL from Shopify
        const uploadRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, graphqlQuery, {
            headers: { 
                'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        console.log("✅ Upload Response:", JSON.stringify(uploadRes.data, null, 2));

        const stagedTarget = uploadRes.data.data?.stagedUploadsCreate?.stagedTargets[0];

        if (!stagedTarget || !stagedTarget.url) {
            throw new Error("❌ Upload URL not received from Shopify");
        }

        // 🔹 Step 3.2: Upload the image file to the pre-signed URL
        const uploadForm = new FormData();
        stagedTarget.parameters.forEach(param => uploadForm.append(param.name, param.value));
        uploadForm.append('file', file.buffer, file.originalname);

        const fileUploadRes = await axios.post(stagedTarget.url, uploadForm, {
            headers: { ...uploadForm.getHeaders() }
        });

        if (fileUploadRes.status !== 204) {
            throw new Error("❌ Image upload failed at server");
        }

        uploadedImages.push(stagedTarget.resourceUrl);
        console.log("✅ Image uploaded successfully:", stagedTarget.resourceUrl);

    } catch (uploadError) {
        console.error("❌ Upload Error:", uploadError.response?.data || uploadError.message);
        return res.status(500).json({ success: false, message: 'Image upload failed' });
    }
}

        // 🔹 Step 4: Save image URLs to metafields
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

// Route to fetch gallery images
app.get('/gallery', async (req, res) => {
    try {
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
        console.error("Error fetching gallery:", error);
        res.status(500).json({ success: false, message: 'Error retrieving images' });
    }
});

// Start the server
app.listen(3000, () => console.log('🚀 Server running on port 3000'));
