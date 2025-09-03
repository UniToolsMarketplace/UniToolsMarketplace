const { Pool } = require('pg');
const express = require('express');
const path = require('path');
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
      images BYTEA[],
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
      images BYTEA[],
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

// Multer: store files in memory (not disk)
const upload = multer({ storage: multer.memoryStorage() });

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

// ---------------- SELL LISTINGS WITH PAGINATION, SORT, SEARCH ----------------
app.get('/api/sell/listings', async (req, res) => {
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  let orderClause = "";
  if (sort === "asc") orderClause = "ORDER BY price ASC";
  else if (sort === "desc") orderClause = "ORDER BY price DESC";
  else orderClause = "ORDER BY id DESC";

  const searchQuery = `%${search.toLowerCase()}%`;

  const totalResult = await pool.query(
    "SELECT COUNT(*) FROM sell_listings WHERE is_published = true AND LOWER(item_name) LIKE $1",
    [searchQuery]
  );
  const total = parseInt(totalResult.rows[0].count);

  const result = await pool.query(
    `SELECT * FROM sell_listings 
     WHERE is_published = true AND LOWER(item_name) LIKE $1
     ${orderClause} LIMIT $2 OFFSET $3`,
    [searchQuery, limit, offset]
  );

  const listings = result.rows.map(l => ({
    ...l,
    images: l.images ? l.images.map(img => `data:image/jpeg;base64,${img.toString("base64")}`) : []
  }));

  res.json({ listings, total, page, totalPages: Math.ceil(total / limit) });
});

app.post('/preowned/sell', upload.array('images'), async (req, res) => {
  const { seller_name='', email, contact_number='', whatsapp_number='', item_name, item_description='', price, price_period='' } = req.body;
  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!item_name || !price) return res.status(400).send('Missing required fields');

  // size check
  const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > 5 * 1024 * 1024) return res.status(400).send("Total image size cannot exceed 5MB");

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  otpStore[email] = { otp, listingId: id, type: "sell" };

  const imageBuffers = req.files.map(f => f.buffer);

  await pool.query(
    `INSERT INTO sell_listings (id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, images, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, imageBuffers, false]
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

// ---------------- LEASE LISTINGS WITH PAGINATION, SORT, SEARCH ----------------
app.get('/api/lease/listings', async (req, res) => {
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  let orderClause = "";
  if (sort === "asc") orderClause = "ORDER BY price ASC";
  else if (sort === "desc") orderClause = "ORDER BY price DESC";
  else orderClause = "ORDER BY id DESC";

  const searchQuery = `%${search.toLowerCase()}%`;

  const totalResult = await pool.query(
    "SELECT COUNT(*) FROM lease_listings WHERE is_published = true AND LOWER(item_name) LIKE $1",
    [searchQuery]
  );
  const total = parseInt(totalResult.rows[0].count);

  const result = await pool.query(
    `SELECT * FROM lease_listings 
     WHERE is_published = true AND LOWER(item_name) LIKE $1
     ${orderClause} LIMIT $2 OFFSET $3`,
    [searchQuery, limit, offset]
  );

  const listings = result.rows.map(l => ({
    ...l,
    images: l.images ? l.images.map(img => `data:image/jpeg;base64,${img.toString("base64")}`) : []
  }));

  res.json({ listings, total, page, totalPages: Math.ceil(total / limit) });
});

app.post('/preowned/lease', upload.array('images'), async (req, res) => {
  const { seller_name='', email, contact_number='', whatsapp_number='', item_name, item_description='', price, price_period='' } = req.body;
  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!item_name || !price) return res.status(400).send('Missing required fields');

  // size check
  const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > 5 * 1024 * 1024) return res.status(400).send("Total image size cannot exceed 5MB");

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  otpStore[email] = { otp, listingId: id, type: "lease" };

  const imageBuffers = req.files.map(f => f.buffer);

  await pool.query(
    `INSERT INTO lease_listings (id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, images, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, imageBuffers, false]
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
