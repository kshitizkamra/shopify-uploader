const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for frontend access
app.use(cors());
app.use(express.json());

// Google Cloud Storage setup
const storage = new Storage();
const bucketName = 'YOUR_GCS_BUCKET_NAME';

// Multer setup for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// ✅ Health check route (to avoid Cloud Run errors)
app.get('/', (req, res) => {
    res.send('🚀 Sizyx Server is running!');
});

// ✅ File upload endpoint
app.post('/upload', upload.single('photos'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded.' });
        }

        const fileName = `${Date.now()}_${req.file.originalname}`;
        const blob = storage.bucket(bucketName).file(fileName);
        const blobStream = blob.createWriteStream({
            metadata: { contentType: req.file.mimetype },
        });

        blobStream.on('error', (err) => {
            console.error('Upload Error:', err);
            res.status(500).json({ success: false, message: 'Upload failed' });
        });

        blobStream.on('finish', async () => {
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
            console.log('File uploaded:', publicUrl);
            res.status(200).json({ success: true, message: 'File uploaded successfully', url: publicUrl });
        });

        blobStream.end(req.file.buffer);
    } catch (error) {
        console.error('Upload Exception:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ✅ Fetch uploaded images (Gallery)
app.get('/gallery', async (req, res) => {
    try {
        const [files] = await storage.bucket(bucketName).getFiles();
        const urls = files.map(file => `https://storage.googleapis.com/${bucketName}/${file.name}`);
        res.json({ success: true, images: urls });
    } catch (error) {
        console.error('Gallery Fetch Error:', error);
        res.status(500).json({ success: false, message: 'Failed to load gallery' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
