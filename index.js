const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  try {
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

    console.log("✅ Database initialized");
  } catch (err) {
    console.error("❌ Database init failed:", err);
  }
}
initDB();

process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

const express = require("express");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads/pending");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// Email setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// OTP store
const otpStore = {};

// ----------- ROUTES ------------

// Home + Pages
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/index.html"))
);
app.get("/preowned/sell", (req, res) =>
  res.sendFile(path.join(__dirname, "public/sell.html"))
);
app.get("/preowned/buy", (req, res) =>
  res.sendFile(path.join(__dirname, "public/buy.html"))
);
app.get("/preowned/lease", (req, res) =>
  res.sendFile(path.join(__dirname, "public/lease.html"))
);
app.get("/preowned/rent", (req, res) =>
  res.sendFile(path.join(__dirname, "public/rent.html"))
);
app.get("/listing/:id", (req, res) =>
  res.sendFile(path.join(__dirname, "public/listing.html"))
);
app.get("/faculties", (req, res) =>
  res.sendFile(path.join(__dirname, "public/faculties.html"))
);
app.get("/dentistry", (req, res) =>
  res.sendFile(path.join(__dirname, "public/dentistry.html"))
);
app.get("/preowned", (req, res) =>
  res.sendFile(path.join(__dirname, "public/preowned.html"))
);

// ---------------- SELL APIs ----------------

// Get all published sell listings
app.get("/api/sell/listings", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sell_listings WHERE is_published = true"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// POST Sell form
app.post("/preowned/sell", upload.array("images", 5), async (req, res) => {
  const {
    sellerName = "",
    email,
    contactNumber = "",
    whatsappNumber = "",
    itemName,
    itemDescription = "",
    price,
    pricePeriod = "",
  } = req.body;

  if (!email || !email.endsWith("@bue.edu.eg"))
    return res.status(400).send("Email must be @bue.edu.eg domain");
  if (!itemName || !price)
    return res.status(400).send("Missing required fields");

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, listingId: id, type: "sell" };

  const images = req.files
    ? req.files.map((f) => `/uploads/pending/${f.filename}`)
    : [];

  try {
    await pool.query(
      `INSERT INTO sell_listings 
        (id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, images, is_published) 
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        sellerName,
        email,
        contactNumber,
        whatsappNumber,
        itemName,
        itemDescription,
        price,
        pricePeriod,
        images,
        false,
      ]
    );
  } catch (err) {
    console.error("DB Insert error:", err);
    return res.status(500).send("Failed to save listing");
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const verifyUrl = `${baseUrl}/verify-otp/sell?id=${id}&email=${encodeURIComponent(
    email
  )}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP for Your Sell Listing",
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
  };
  transporter.sendMail(mailOptions, () => {});
  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});

// ---------------- LEASE APIs ----------------

// Get all published lease listings
app.get("/api/lease/listings", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM lease_listings WHERE is_published = true"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

// POST Lease form
app.post("/preowned/lease", upload.array("images", 5), async (req, res) => {
  const {
    sellerName = "",
    email,
    contactNumber = "",
    whatsappNumber = "",
    itemName,
    itemDescription = "",
    price,
    pricePeriod = "",
  } = req.body;

  if (!email || !email.endsWith("@bue.edu.eg"))
    return res.status(400).send("Email must be @bue.edu.eg domain");
  if (!itemName || !price)
    return res.status(400).send("Missing required fields");

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, listingId: id, type: "lease" };

  const images = req.files
    ? req.files.map((f) => `/uploads/lease/pending/${f.filename}`)
    : [];

  try {
    await pool.query(
      `INSERT INTO lease_listings 
        (id, seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period, images, is_published) 
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        sellerName,
        email,
        contactNumber,
        whatsappNumber,
        itemName,
        itemDescription,
        price,
        pricePeriod,
        images,
        false,
      ]
    );
  } catch (err) {
    console.error("DB Insert error:", err);
    return res.status(500).send("Failed to save listing");
  }

  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const verifyUrl = `${baseUrl}/verify-otp/lease?id=${id}&email=${encodeURIComponent(
    email
  )}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP for Your Lease Listing",
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
  };
  transporter.sendMail(mailOptions, () => {});
  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});

// -------------------- Run Server -------------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
