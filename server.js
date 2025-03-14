import express from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize Google Cloud Storage
const storage = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
const bucketName = process.env.GCLOUD_BUCKET_NAME;
const bucket = storage.bucket(bucketName);

// Multer storage configuration (memory storage for direct upload)
const upload = multer({ storage: multer.memoryStorage() });

// Upload endpoint
app.post('/upload', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded.' });
        }

        const fileName = `${Date.now()}-${req.file.originalname}`;
        const file = bucket.file(fileName);

        const stream = file.createWriteStream({
            metadata: {
                contentType: req.file.mimetype
            }
        });

        stream.on('error', (err) => {
            console.error('Upload error:', err);
            res.status(500).json({ success: false, message: 'File upload failed.' });
        });

        stream.on('finish', async () => {
            await file.makePublic(); // Make file public for access
            const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
            res.status(200).json({ success: true, message: 'File uploaded successfully.', url: publicUrl });
        });

        stream.end(req.file.buffer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Internal server error.' });
    }
});

// Gallery endpoint to fetch uploaded images
app.get('/gallery', async (req, res) => {
    try {
        const [files] = await bucket.getFiles();
        const images = files.map(file => `https://storage.googleapis.com/${bucketName}/${file.name}`);
        res.json({ success: true, images });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Failed to load gallery.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
