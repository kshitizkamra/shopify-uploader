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
const METAOBJECT_DEFINITION_ID = process.env.METAOBJECT_DEFINITION_ID; // Get this from Shopify Admin

// Route to upload images and save to metaobjects
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

        // 🔹 Step 1: Get customer by email
        console.log("🔍 Fetching customer data...");
        const customerRes = await axios.get(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json?email=${customer_email}`, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
        });

        let customer = customerRes.data.customers[0];

        if (!customer) {
            console.log("❌ Customer not found. Creating new customer...");
            const newCustomerRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/customers.json`, {
                customer: { email: customer_email, accepts_marketing: true }
            }, {
                headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
            });

            customer = newCustomerRes.data.customer;
            console.log("✅ New customer created:", customer.id);
        } else {
            console.log("✅ Existing customer found:", customer.id);
        }

        // 🔹 Step 2: Upload images to Shopify Files
        let uploadedImages = [];
        for (let file of files) {
            console.log(`📤 Uploading ${file.originalname}...`);

            const fileBase64 = file.buffer.toString('base64');

            const uploadRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
                query: `
                  mutation fileCreate($files: [FileCreateInput!]!) {
                    fileCreate(files: $files) {
                      files {
                        url
                      }
                      userErrors {
                        field
                        message
                      }
                    }
                  }
                `,
                variables: {
                    files: [{ originalSource: `data:${file.mimetype};base64,${fileBase64}` }]
                }
            }, {
                headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
            });

            console.log("✅ Upload Response:", uploadRes.data);

            const uploadedFile = uploadRes.data.data.fileCreate.files[0];
            if (!uploadedFile) {
                console.log("❌ Image upload failed");
                return res.status(500).json({ success: false, message: 'Image upload failed' });
            }

            uploadedImages.push(uploadedFile.url);
        }

        // 🔹 Step 3: Save images to Metaobject
        console.log("💾 Saving images to Metaobject...");

        const metaobjectRes = await axios.post(`https://${SHOPIFY_STORE}/admin/api/2024-01/metaobjects.json`, {
            metaobject: {
                definition_id: METAOBJECT_DEFINITION_ID,
                fields: [
                    { key: "images", value: JSON.stringify(uploadedImages), type: "json" },
                    { key: "caption", value: caption, type: "single_line_text_field" }
                ]
            }
        }, {
            headers: { 'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN }
        });

        console.log("✅ Metaobject saved:", metaobjectRes.data);

        res.json({ success: true, message: 'Images uploaded successfully!', images: uploadedImages });

    } catch (error) {
        console.error("❌ Server Error:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Start the server
app.listen(3000, () => console.log('Server running on port 3000'));
