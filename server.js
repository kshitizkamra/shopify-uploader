import express from "express";
import multer from "multer";
import cors from "cors";
import dotenv from "dotenv";
import { Storage } from "@google-cloud/storage";
import path from "path";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS for Shopify frontend
app.use(cors());
app.use(express.json());

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
  keyFilename: process.env.GCLOUD_KEYFILE, // Path to service account JSON
});
const bucketName = process.env.GCLOUD_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

// Multer Configuration
const multerStorage = multer.memoryStorage();
const upload = multer({
  storage: multerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// 🚀 Upload Image API
app.post("/upload", upload.single("photos"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const ext = path.extname(req.file.originalname);
    const filename = `rewear-${Date.now()}${ext}`;
    const file = bucket.file(filename);

    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;

    return res.status(200).json({ success: true, message: "Upload successful!", imageUrl: publicUrl });
  } catch (error) {
    console.error("Upload Error:", error);
    return res.status(500).json({ success: false, message: "Upload failed", error: error.message });
  }
});

// 📸 Fetch Gallery Images API
app.get("/gallery", async (req, res) => {
  try {
    const [files] = await bucket.getFiles();
    const imageUrls = files.map(file => `https://storage.googleapis.com/${bucketName}/${file.name}`);

    return res.json({ success: true, images: imageUrls });
  } catch (error) {
    console.error("Gallery Error:", error);
    return res.status(500).json({ success: false, message: "Failed to load gallery", error: error.message });
  }
});

// Start Server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
