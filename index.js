const { Pool } = require('pg');
const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ---------------- DB SETUP ----------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sell_listings (
      id UUID PRIMARY KEY,
      seller_name TEXT,
      email TEXT,
      contact_number TEXT,
      whatsapp_number TEXT,
      item_name TEXT,
      item_description TEXT,
      price NUMERIC,
      price_period TEXT,
      images TEXT[],
      is_published BOOLEAN DEFAULT false
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS lease_listings (
      id UUID PRIMARY KEY,
      seller_name TEXT,
      email TEXT,
      contact_number TEXT,
      whatsapp_number TEXT,
      item_name TEXT,
      item_description TEXT,
      price NUMERIC,
      price_period TEXT,
      images TEXT[],
      is_published BOOLEAN DEFAULT false
    );
  `);
}
initDB();

// ---------------- APP SETUP ----------------
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads/pending');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

// OTP store
const otpStore = {};

// ---------------- ROUTES ----------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/preowned/sell', (req, res) => res.sendFile(path.join(__dirname, 'public/sell.html')));
app.get('/preowned/buy', (req, res) => res.sendFile(path.join(__dirname, 'public/buy.html')));
app.get('/preowned/lease', (req, res) => res.sendFile(path.join(__dirname, 'public/lease.html')));
app.get('/preowned/rent', (req, res) => res.sendFile(path.join(__dirname, 'public/rent.html')));
app.get('/listing/:id', (req,res) => res.sendFile(path.join(__dirname,'public/listing.html')));
app.get('/faculties', (req, res) => res.sendFile(path.join(__dirname, 'public/faculties.html')));
app.get('/dentistry', (req, res) => res.sendFile(path.join(__dirname, 'public/dentistry.html')));
app.get('/preowned', (req, res) => res.sendFile(path.join(__dirname, 'public/preowned.html')));

// ---------------- SELL APIs ----------------
app.get('/api/sell/listings', async (req, res) => {
  const result = await pool.query("SELECT * FROM sell_listings WHERE is_published = true");
  res.json(result.rows);
});

app.get('/api/sell/listings/:id', async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM sell_listings WHERE id = $1 AND is_published = true",
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Listing not found" });
  res.json(result.rows[0]);
});

app.post('/preowned/sell', upload.array('images', 5), async (req, res) => {
  const { sellerName='', email, contactNumber='', whatsappNumber='', itemName, itemDescription='', price, pricePeriod='' } = req.body;
  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!itemName || !price) return res.status(400).send('Missing required fields');

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  otpStore[email] = { otp, listingId: id, type: "sell" };

  const images = req.files ? req.files.map(f => `/uploads/pending/${f.filename}`) : [];
  await pool.query(
    `INSERT INTO sell_listings (id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, images, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, sellerName, email, contactNumber, whatsappNumber, itemName, itemDescription, price, pricePeriod, images, false]
  );

  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const verifyUrl = `${baseUrl}/verify-otp/sell?id=${id}&email=${encodeURIComponent(email)}`;
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'OTP for Your Sell Listing',
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
  }, () => {});
  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});

app.get('/verify-otp/sell', (req, res) => {
  res.send(`<form action="/verify-otp/sell" method="POST">
    <input type="hidden" name="id" value="${req.query.id}" />
    <input type="hidden" name="email" value="${req.query.email}" />
    <label>Enter OTP:</label><input name="otp" required />
    <button type="submit">Verify</button>
  </form>`);
});

app.post('/verify-otp/sell', async (req, res) => {
  const { id, email, otp } = req.body;
  const otpData = otpStore[email];
  if (!otpData || otpData.otp !== otp || otpData.listingId !== id || otpData.type !== "sell")
    return res.status(400).send('Invalid OTP');

  await pool.query("UPDATE sell_listings SET is_published = true WHERE id = $1", [id]);
  delete otpStore[email];
  res.send(`<h1>Sell Listing Verified!</h1><a href="/preowned/buy">View listings</a>`);
});

// ---------------- LEASE APIs ----------------
app.get('/api/lease/listings', async (req, res) => {
  const result = await pool.query("SELECT * FROM lease_listings WHERE is_published = true");
  res.json(result.rows);
});

app.get('/api/lease/listings/:id', async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM lease_listings WHERE id = $1 AND is_published = true",
    [req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Listing not found" });
  res.json(result.rows[0]);
});

// Separate multer storage for lease
const storageLease = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads/lease/pending');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const uploadLease = multer({ storage: storageLease });

app.post('/preowned/lease', uploadLease.array('images', 5), async (req, res) => {
  const { sellerName='', email, contactNumber='', whatsappNumber='', itemName, itemDescription='', price, pricePeriod='' } = req.body;
  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!itemName || !price) return res.status(400).send('Missing required fields');

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  otpStore[email] = { otp, listingId: id, type: "lease" };

  const images = req.files ? req.files.map(f => `/uploads/lease/pending/${f.filename}`) : [];
  await pool.query(
    `INSERT INTO lease_listings (id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, images, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, sellerName, email, contactNumber, whatsappNumber, itemName, itemDescription, price, pricePeriod, images, false]
  );

  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const verifyUrl = `${baseUrl}/verify-otp/lease?id=${id}&email=${encodeURIComponent(email)}`;
  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'OTP for Your Lease Listing',
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
  }, () => {});
  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});

app.get('/verify-otp/lease', (req, res) => {
  res.send(`<form action="/verify-otp/lease" method="POST">
    <input type="hidden" name="id" value="${req.query.id}" />
    <input type="hidden" name="email" value="${req.query.email}" />
    <label>Enter OTP:</label><input name="otp" required />
    <button type="submit">Verify</button>
  </form>`);
});

app.post('/verify-otp/lease', async (req, res) => {
  const { id, email, otp } = req.body;
  const otpData = otpStore[email];
  if (!otpData || otpData.otp !== otp || otpData.listingId !== id || otpData.type !== "lease")
    return res.status(400).send('Invalid OTP');

  await pool.query("UPDATE lease_listings SET is_published = true WHERE id = $1", [id]);
  delete otpStore[email];
  res.send(`<h1>Lease Listing Verified!</h1><a href="/preowned/rent">View listings</a>`);
});

// ---------------- SERVER ----------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
