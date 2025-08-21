process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

const express = require('express');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware
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

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

// File paths
const SELL_LISTINGS_FILE = path.join(__dirname, 'listingsforsale.json');
const LEASE_LISTINGS_FILE = path.join(__dirname, 'listingsforlease.json');

// Helpers for SELL
function readSellListings() {
  try { return JSON.parse(fs.readFileSync(SELL_LISTINGS_FILE, 'utf8')); }
  catch { return []; }
}
function writeSellListings(listings) {
  fs.writeFileSync(SELL_LISTINGS_FILE, JSON.stringify(listings, null, 2));
}

// Helpers for LEASE
function readLeaseListings() {
  try { return JSON.parse(fs.readFileSync(LEASE_LISTINGS_FILE, 'utf8')); }
  catch { return []; }
}
function writeLeaseListings(listings) {
  fs.writeFileSync(LEASE_LISTINGS_FILE, JSON.stringify(listings, null, 2));
}

// OTP store
const otpStore = {};

// ----------- ROUTES ------------

// Home + Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/preowned/sell', (req, res) => res.sendFile(path.join(__dirname, 'public/sell.html')));
app.get('/preowned/buy', (req, res) => res.sendFile(path.join(__dirname, 'public/buy.html')));
app.get('/preowned/lease', (req, res) => res.sendFile(path.join(__dirname, 'public/lease.html')));
app.get('/preowned/rent', (req, res) => res.sendFile(path.join(__dirname, 'public/rent.html')));
app.get('/listing/:id', (req,res) => res.sendFile(path.join(__dirname,'public/listing.html')));
app.get('/faculties', (req, res) => res.sendFile(path.join(__dirname, 'public/faculties.html')));
app.get('/dentistry', (req, res) => res.sendFile(path.join(__dirname, 'public/dentistry.html')));
app.get('/dentistry/preowned', (req, res) => res.sendFile(path.join(__dirname, 'public/preowned.html')));

// ---------------- SELL APIs ----------------

// Get all published sell listings
app.get('/api/sell/listings', (req, res) => {
  res.json(readSellListings().filter(l => l.isPublished));
});

// Get one sell listing
app.get('/api/sell/listings/:id', (req, res) => {
  const listing = readSellListings().find(l => l.id === req.params.id && l.isPublished);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  res.json(listing);
});

// POST Sell form
app.post('/preowned/sell', upload.array('images', 5), (req, res) => {
  const { sellerName='', email, contactNumber='', whatsappNumber='', itemName, itemDescription='', price, pricePeriod='' } = req.body;
  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!itemName || !price) return res.status(400).send('Missing required fields');

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  otpStore[email] = { otp, listingId: id, type: "sell" };

  const images = req.files ? req.files.map(f => `/uploads/pending/${f.filename}`) : [];
  const listings = readSellListings();
  listings.push({ id, sellerName, email, contactNumber, whatsappNumber, itemName, itemDescription, price: parseFloat(price), pricePeriod, images, isPublished: false, otpVerified: false });
  writeSellListings(listings);

  const verifyUrl = `http://localhost:${port}/verify-otp/sell?id=${id}&email=${encodeURIComponent(email)}`;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'OTP for Your Sell Listing',
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
  };
  transporter.sendMail(mailOptions, () => {});
  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});

// Verify OTP for SELL
app.get('/verify-otp/sell', (req, res) => {
  res.send(`<form action="/verify-otp/sell" method="POST">
    <input type="hidden" name="id" value="${req.query.id}" />
    <input type="hidden" name="email" value="${req.query.email}" />
    <label>Enter OTP:</label><input name="otp" required />
    <button type="submit">Verify</button>
  </form>`);
});

app.post('/verify-otp/sell', (req, res) => {
  const { id, email, otp } = req.body;
  const otpData = otpStore[email];
  if (!otpData || otpData.otp !== otp || otpData.listingId !== id || otpData.type !== "sell")
    return res.status(400).send('Invalid OTP');

  let listings = readSellListings();
  const listing = listings.find(l => l.id === id);
  if (!listing) return res.status(404).send('Listing not found');
  listing.isPublished = true;
  writeSellListings(listings);
  delete otpStore[email];
  res.send(`<h1>Sell Listing Verified!</h1><a href="/preowned/buy">View listings</a>`);
});

// ---------------- LEASE APIs ----------------

// Get all published lease listings
app.get('/api/lease/listings', (req, res) => {
  res.json(readLeaseListings().filter(l => l.isPublished));
});

// Get one lease listing
app.get('/api/lease/listings/:id', (req, res) => {
  const listing = readLeaseListings().find(l => l.id === req.params.id && l.isPublished);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  res.json(listing);
});

// --- Multer storage specifically for lease uploads ---
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

// --- POST Lease form route ---
app.post('/preowned/lease', uploadLease.array('images', 5), (req, res) => {
  const { sellerName='', email, contactNumber='', whatsappNumber='', itemName, itemDescription='', price, pricePeriod='' } = req.body;
  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!itemName || !price) return res.status(400).send('Missing required fields');

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  otpStore[email] = { otp, listingId: id, type: "lease" };

  // ✅ Save images paths correctly
  const images = req.files ? req.files.map(f => `/uploads/lease/pending/${f.filename}`) : [];
  const listings = readLeaseListings();
  listings.push({ id, sellerName, email, contactNumber, whatsappNumber, itemName, itemDescription, price: parseFloat(price), pricePeriod, images, isPublished: false, otpVerified: false });
  writeLeaseListings(listings);

  const verifyUrl = `http://localhost:${port}/verify-otp/lease?id=${id}&email=${encodeURIComponent(email)}`;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'OTP for Your Lease Listing',
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
  };
  transporter.sendMail(mailOptions, () => {});
  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});


// Verify OTP for LEASE
app.get('/verify-otp/lease', (req, res) => {
  res.send(`<form action="/verify-otp/lease" method="POST">
    <input type="hidden" name="id" value="${req.query.id}" />
    <input type="hidden" name="email" value="${req.query.email}" />
    <label>Enter OTP:</label><input name="otp" required />
    <button type="submit">Verify</button>
  </form>`);
});

app.post('/verify-otp/lease', (req, res) => {
  const { id, email, otp } = req.body;
  const otpData = otpStore[email];
  if (!otpData || otpData.otp !== otp || otpData.listingId !== id || otpData.type !== "lease")
    return res.status(400).send('Invalid OTP');

  let listings = readLeaseListings();
  const listing = listings.find(l => l.id === id);
  if (!listing) return res.status(404).send('Listing not found');
  listing.isPublished = true;
  writeLeaseListings(listings);
  delete otpStore[email];
  res.send(`<h1>Lease Listing Verified!</h1><a href="/preowned/rent">View listings</a>`);
});

// -------------------- Run Server -------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));

app.post("/api/notify-view-contact", (req, res) => {
  const { id, type } = req.body;

  let listing;
  if (type === "sell") {
    listing = readSellListings().find(l => l.id === id);
  } else if (type === "lease") {
    listing = readLeaseListings().find(l => l.id === id);
  }

  if (!listing) {
    return res.status(404).json({ error: "Listing not found" });
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL || process.env.EMAIL_USER, // fallback
    subject: `Contact viewed for listing ${listing.itemName}`,
    html: `<p>Someone clicked "View Contact" for tool: <b>${listing.itemName}</b> (ID: ${listing.id})</p>`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.error("Error sending contact notification:", err);
      return res.status(500).json({ error: "Failed to send notification" });
    }
    console.log("Contact view notification sent:", info.response);
    res.json({ success: true });
  });
});

