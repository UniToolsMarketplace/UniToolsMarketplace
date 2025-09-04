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
const port = process.env.PORT || 3000;

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
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  let order = [];
  if (sort === "asc") order.push({ price: "asc" });
  else if (sort === "desc") order.push({ price: "desc" });
  else order.push({ "xata.createdAt": "desc" });

  try {
    const listingsResult = await xata.db.sell_listings
      .filter({
        is_published: true,
        ...(search ? { item_name: { $contains: search } } : {})
      })
      .sort(order)
      .getPaginated({ pagination: { size: limit, offset: (page - 1) * limit } });

    const listings = listingsResult.records.map(l => ({
      ...l,
      images: l.images || []
    }));

    res.json({ listings, total: listingsResult.totalCount, page, totalPages: Math.ceil(listingsResult.totalCount / limit) });
  } catch (err) {
    console.error("Error fetching sell listings:", err);
    res.status(500).send("Failed to fetch sell listings. " + err.message);
  }
});

app.post('/preowned/sell', upload.array('images'), async (req, res) => {
  try {
    const { seller_name='', email, contact_number='', whatsapp_number='', item_name, item_description='', price, price_period='' } = req.body;
    if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
    if (!item_name || !price) return res.status(400).send('Missing required fields');

    const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 200 * 1024) return res.status(400).send("Total image size cannot exceed 200KB. Please compress your images.");

    const id = uuidv4();
    const otp = Math.floor(100000 + Math.random()*900000).toString();
    otpStore[email] = { otp, listingId: id, type: "sell" };

    const imageFiles = [];
    for (const file of req.files) {
      const uploaded = await xata.files.upload({
        name: file.originalname,
        mediaType: file.mimetype,
        data: file.buffer,
      });
      imageFiles.push(uploaded);
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
      images: imageFiles,   // ✅ fixed here
      is_published: false
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    const verifyUrl = `${baseUrl}/verify-otp/sell?id=${id}&email=${encodeURIComponent(email)}`;
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP for Your Sell Listing',
      html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
    }, (err) => {
      if (err) console.error("Error sending email:", err);
    });
    res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
  } catch (err) {
    console.error("Error creating sell listing:", err);
    res.status(500).send("Failed to create sell listing. " + err.message);
  }
});

// ---------------- LEASE LISTINGS ----------------
app.get('/api/lease/listings', async (req, res) => {
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  let order = [];
  if (sort === "asc") order.push({ price: "asc" });
  else if (sort === "desc") order.push({ price: "desc" });
  else order.push({ "xata.createdAt": "desc" });

  try {
    const listingsResult = await xata.db.lease_listings
      .filter({
        is_published: true,
        ...(search ? { item_name: { $contains: search } } : {})
      })
      .sort(order)
      .getPaginated({ pagination: { size: limit, offset: (page - 1) * limit } });

    const listings = listingsResult.records.map(l => ({
      ...l,
      images: l.images || []
    }));

    res.json({ listings, total: listingsResult.totalCount, page, totalPages: Math.ceil(listingsResult.totalCount / limit) });
  } catch (err) {
    console.error("Error fetching lease listings:", err);
    res.status(500).send("Failed to fetch lease listings. " + err.message);
  }
});

app.post('/preowned/lease', upload.array('images'), async (req, res) => {
  try {
    const { seller_name='', email, contact_number='', whatsapp_number='', item_name, item_description='', price, price_period='' } = req.body;
    if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
    if (!item_name || !price) return res.status(400).send('Missing required fields');

    const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 5 * 1024 * 1024) return res.status(400).send("Total image size cannot exceed 5MB");

    const id = uuidv4();
    const otp = Math.floor(100000 + Math.random()*900000).toString();
    otpStore[email] = { otp, listingId: id, type: "lease" };

    const imageFiles = [];
    for (const file of req.files) {
      const uploaded = await xata.files.upload({
        name: file.originalname,
        mediaType: file.mimetype,
        data: file.buffer,
      });
      imageFiles.push(uploaded);
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
      images: imageFiles,   // ✅ fixed here
      is_published: false
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    const verifyUrl = `${baseUrl}/verify-otp/lease?id=${id}&email=${encodeURIComponent(email)}`;
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'OTP for Your Lease Listing',
      html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`
    }, (err) => {
      if (err) console.error("Error sending email:", err);
    });
    res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
  } catch (err) {
    console.error("Error creating lease listing:", err);
    res.status(500).send("Failed to create lease listing. " + err.message);
  }
});

// ---------------- SERVER ----------------
app.listen(port, () => console.log(`Server running on port ${port}`));
