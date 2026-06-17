const express = require('express');
const mysql = require('mysql2');
const { BlobServiceClient } = require('@azure/storage-blob');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const app = express();

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

// 1. Koneksi Database MySQL (Menggunakan SSL agar aman di Azure)
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

// Tes koneksi database saat startup agar log terbaca jika ada error konfigurasi
db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err.message);
    } else {
        console.log("Connected to MySQL Database.");
    }
});

// 2. Inisialisasi Azure Blob Storage dengan Error Handling kuat
let blobServiceClient;
try {
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        console.log("Azure Blob Storage client initialized successfully.");
    } else {
        console.error("AZURE_STORAGE_CONNECTION_STRING is missing in Environment Variables!");
    }
} catch (e) {
    console.error("Failed to initialize Blob Service Client:", e.message);
}

// 3. Endpoint POST untuk memproses form submit tugas
app.post('/submit-task', upload.single('file_tugas'), async (req, res) => {
    try {
        // Menggunakan alias classField karena 'class' adalah reserved keyword di JavaScript
        const { nim, name, class: classField, course } = req.body;

        // Validasi input file
        if (!req.file) {
            return res.status(400).send("<h1>Error: Tidak ada file yang diunggah!</h1><a href='/'>Kembali</a>");
        }

        // Validasi koneksi storage
        if (!blobServiceClient) {
            return res.status(500).send("<h1>Error: Konfigurasi Azure Blob Storage rusak atau kosong!</h1><a href='/'>Kembali</a>");
        }

        // Penamaan file unik di Blob: NIM_NamaFile Asli
        const blobName = `${nim}_${req.file.originalname}`;

        // Langkah A: Upload file ke Azure Blob Storage (Sudah disesuaikan ke praktikum-049)
        const containerClient = blobServiceClient.getContainerClient('praktikum-049');
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        await blockBlobClient.uploadData(req.file.buffer, {
            blobHTTPHeaders: { blobContentType: req.file.mimetype }
        });
        
        const fileUrl = blockBlobClient.url;
        console.log(`File uploaded successfully to blob: ${fileUrl}`);

        // Langkah B: Simpan data ke database MySQL (Menggunakan kolom 'class' sesuai struktur modul kamu)
        const sql = "INSERT INTO submissions (nim, name, class, course, file_url) VALUES (?, ?, ?, ?, ?)";
        
        db.query(sql, [nim, name, classField, course, fileUrl], (err, result) => {
            if (err) {
                console.error("SQL Error saat menyimpan ke MySQL:", err.message);
                return res.status(500).send(`<h1>Gagal menyimpan data ke database!</h1><p>Detail Error: ${err.message}</p><a href='/'>Kembali</a>`);
            }
            
            console.log("Data successfully saved to database.");
            res.send("<h1>Tugas Berhasil Dikirim!</h1><a href='/'>Kembali</a>");
        });

    } catch (error) {
        console.error("Fatal Error pada endpoint /submit-task:", error.message);
        res.status(500).send(`<h1>Terjadi kesalahan internal pada server!</h1><p>${error.message}</p><a href='/'>Kembali</a>`);
    }
});

// Menangkap error unhandled rejection agar web server Azure tidak gampang mati/crash loop
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 4. Jalankan Server sesuai Port bawaan Azure
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running smoothly on port ${PORT}`);
});
