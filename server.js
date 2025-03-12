require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");

const app = express();
app.use(express.json());

const SHOPIFY_STORE = process.env.SHOPIFY_STORE; // e.g., "your-store.myshopify.com"
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = "2024-01"; // Ensure the latest API version

// 🟢 Helper Function: Fetch Shopify API
async function shopifyFetch(query, variables = {}) {
    const response = await fetch(`https://${SHOPIFY_STORE}/admin/api/${API_VERSION}/graphql.json`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN
        },
        body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    console.log("🔍 Shopify API Response:", JSON.stringify(data, null, 2)); // Debugging
    return data;
}

// 🔹 1. Fetch Existing Customer by Email
app.post("/get-customer", async (req, res) => {
    const { email } = req.body;

    const query = `
        query getCustomer($email: String!) {
            customers(first: 1, query: $email) {
                edges {
                    node {
                        id
                        email
                    }
                }
            }
        }
    `;

    try {
        const response = await shopifyFetch(query, { email });

        if (response.data.customers.edges.length === 0) {
            return res.status(404).json({ error: "Customer not found" });
        }

        const customer = response.data.customers.edges[0].node;
        res.json({ customer });

    } catch (error) {
        console.error("❌ Error fetching customer:", error);
        res.status(500).json({ error: "Server error fetching customer" });
    }
});

// 🔹 2. Upload Image to Shopify Files API
app.post("/upload-image", async (req, res) => {
    const { fileUrl } = req.body;

    const mutation = `
        mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
                files {
                    id
                    url
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    try {
        const response = await shopifyFetch(mutation, { files: [{ originalSource: fileUrl }] });

        if (!response.data.fileCreate || response.data.fileCreate.userErrors.length > 0) {
            return res.status(400).json({ error: response.data.fileCreate.userErrors });
        }

        const uploadedFile = response.data.fileCreate.files[0];
        res.json({ fileUrl: uploadedFile.url });

    } catch (error) {
        console.error("❌ Error uploading file:", error);
        res.status(500).json({ error: "File upload failed" });
    }
});

// 🔹 3. Store Image in Metaobjects
app.post("/update-metaobject", async (req, res) => {
    const { metaobjectId, fieldKey, imageUrl } = req.body;

    const mutation = `
        mutation updateMetaobject($id: ID!, $fields: [MetaobjectFieldInput!]!) {
            metaobjectUpdate(id: $id, fields: $fields) {
                metaobject {
                    id
                    handle
                    fields {
                        key
                        value
                    }
                }
                userErrors {
                    field
                    message
                }
            }
        }
    `;

    try {
        const response = await shopifyFetch(mutation, {
            id: metaobjectId,
            fields: [{ key: fieldKey, value: imageUrl }]
        });

        if (response.data.metaobjectUpdate.userErrors.length > 0) {
            return res.status(400).json({ error: response.data.metaobjectUpdate.userErrors });
        }

        res.json({ metaobject: response.data.metaobjectUpdate.metaobject });

    } catch (error) {
        console.error("❌ Error updating metaobject:", error);
        res.status(500).json({ error: "Metaobject update failed" });
    }
});

// Start the Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
