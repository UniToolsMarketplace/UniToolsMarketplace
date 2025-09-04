const { getXataClient } = require("./xata");
const xata = getXataClient();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ---------------- APP SETUP ----------------
process.on("uncaughtException", (err) => console.error("[UNCAUGHT EXCEPTION]", err));
process.on("unhandledRejection", (reason) => console.error("[UNHANDLED REJECTION]", reason));

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer: store files in memory
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

// ---------------- SELL LISTINGS ----------------
app.get('/api/sell/listings', async (req, res) => {
  try {
    let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    let order = [];
    if (sort === "asc") order.push({ price: "asc" });
    else if (sort === "desc") order.push({ price: "desc" });
    else order.push({ "xata.createdAt": "desc" }); // ✅ correct

    const filter = {
      is_published: true,
      ...(search ? { item_name: { $contains: search } } : {})
    };

    const listingsResult = await xata.db.sell_listings
      .filter(filter)
      .sort(order)
      .getPaginated({ pagination: { size: limit, offset: (page - 1) * limit } });

    const listings = listingsResult.records.map(l => ({
      id: l.id,
      seller_name: l.seller_name,
      email: l.email,
      contact_number: l.contact_number,
      whatsapp_number: l.whatsapp_number,
      item_name: l.item_name,
      item_description: l.item_description,
      price: l.price,
      price_period: l.price_period,
      images: l.images || [], // ✅ now file refs
      is_published: l.is_published
    }));

    res.json({
      listings,
      total: listingsResult.totalCount,
      page,
      totalPages: Math.ceil(listingsResult.totalCount / limit)
    });
  } catch (err) {
    console.error("[/api/sell/listings]", err);
    res.status(500).json({ error: "Failed to load listings." });
  }
});

app.post('/preowned/sell', upload.array('images'), async (req, res) => {
  try {
    const { seller_name='', email, contact_number='', whatsapp_number='', item_name, item_description='', price, price_period='' } = req.body;
    if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
    if (!item_name || !price) return res.status(400).send('Missing required fields');

    const files = Array.isArray(req.files) ? req.files : [];
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > 200 * 1024) return res.status(400).send("Total image size cannot exceed 200KB.");

    const id = uuidv4();
    const otp = Math.floor(100000 + Math.random()*900000).toString();
    otpStore[email] = { otp, listingId: id, type: "sell" };

    // ✅ Upload files to Xata storage
    const images = [];
    for (const f of files) {
      const uploaded = await xata.files.upload(f.buffer, { mediaType: f.mimetype, name: f.originalname });
      images.push(uploaded.url); // or uploaded.id if you prefer IDs
    }

    await xata.db.sell_listings.create({
      id,
      seller_name,
      email,
      contact_number,
      whatsapp_number,
      item_name,
      item_description,
      price: parseFloat(price),
      price_period,
      images,            // ✅ now array of file URLs
      is_published: false
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    const verifyUrl = `${baseUrl}/verify-otp/sell?id=${id}&email=${encodeURIComponent(email)}`;
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP for Your Sell Listing',
      html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
    }, (e) => e && console.error("[sendMail sell]", e));

    res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
  } catch (err) {
    console.error("[/preowned/sell]", err);
    res.status(500).send("Failed to create sell listing.");
  }
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
  try {
    const { id, email, otp } = req.body;
    const otpData = otpStore[email];
    if (!otpData || otpData.otp !== otp || otpData.listingId !== id || otpData.type !== "sell")
      return res.status(400).send('Invalid OTP');

    await xata.db.sell_listings.update(id, { is_published: true });
    delete otpStore[email];
    res.send(`<h1>Sell Listing Verified!</h1><a href="/preowned/buy">View listings</a>`);
  } catch (err) {
    console.error("[verify-otp/sell]", err);
    res.status(500).send("Failed to verify OTP.");
  }
});

// ---------------- LEASE LISTINGS ----------------
app.get('/api/lease/listings', async (req, res) => {
  try {
    let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    let order = [];
    if (sort === "asc") order.push({ price: "asc" });
    else if (sort === "desc") order.push({ price: "desc" });
    else order.push({ "xata.createdAt": "desc" });

    const filter = {
      is_published: true,
      ...(search ? { item_name: { $contains: search } } : {})
    };

    const listingsResult = await xata.db.lease_listings
      .filter(filter)
      .sort(order)
      .getPaginated({ pagination: { size: limit, offset: (page - 1) * limit } });

    const listings = listingsResult.records.map(l => ({
      id: l.id,
      seller_name: l.seller_name,
      email: l.email,
      contact_number: l.contact_number,
      whatsapp_number: l.whatsapp_number,
      item_name: l.item_name,
      item_description: l.item_description,
      price: l.price,
      price_period: l.price_period,
      images: l.images || [],
      is_published: l.is_published
    }));

    res.json({
      listings,
      total: listingsResult.totalCount,
      page,
      totalPages: Math.ceil(listingsResult.totalCount / limit)
    });
  } catch (err) {
    console.error("[/api/lease/listings]", err);
    res.status(500).json({ error: "Failed to load listings." });
  }
});

app.post('/preowned/lease', upload.array('images'), async (req, res) => {
  try {
    const { seller_name='', email, contact_number='', whatsapp_number='', item_name, item_description='', price, price_period='' } = req.body;
    if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
    if (!item_name || !price) return res.status(400).send('Missing required fields');

    const files = Array.isArray(req.files) ? req.files : [];
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalSize > 5 * 1024 * 1024) return res.status(400).send("Total image size cannot exceed 5MB");

    const id = uuidv4();
    const otp = Math.floor(100000 + Math.random()*900000).toString();
    otpStore[email] = { otp, listingId: id, type: "lease" };

    const images = [];
    for (const f of files) {
      const uploaded = await xata.files.upload(f.buffer, { mediaType: f.mimetype, name: f.originalname });
      images.push(uploaded.url);
    }

    await xata.db.lease_listings.create({
      id,
      seller_name,
      email,
      contact_number,
      whatsapp_number,
      item_name,
      item_description,
      price: parseFloat(price),
      price_period,
      images,
      is_published: false
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    const verifyUrl = `${baseUrl}/verify-otp/lease?id=${id}&email=${encodeURIComponent(email)}`;
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP for Your Lease Listing',
      html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
    }, (e) => e && console.error("[sendMail lease]", e));

    res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
  } catch (err) {
    console.error("[/preowned/lease]", err);
    res.status(500).send("Failed to create lease listing.");
  }
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
  try {
    const { id, email, otp } = req.body;
    const otpData = otpStore[email];
    if (!otpData || otpData.otp !== otp || otpData.listingId !== id || otpData.type !== "lease")
      return res.status(400).send('Invalid OTP');

    await xata.db.lease_listings.update(id, { is_published: true });
    delete otpStore[email];
    res.send(`<h1>Lease Listing Verified!</h1><a href="/preowned/rent">View listings</a>`);
  } catch (err) {
    console.error("[verify-otp/lease]", err);
    res.status(500).send("Failed to verify OTP.");
  }
});

// ---------------- SERVER ----------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
