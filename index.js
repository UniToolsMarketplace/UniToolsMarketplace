const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
require("dotenv").config();

console.log("DEBUG: ENV VARS");
console.log("XATA_API_KEY:", process.env.XATA_API_KEY ? "[SET]" : "[MISSING]");
console.log("XATA_DATABASE_URL:", process.env.XATA_DATABASE_URL);

const { getXataClient } = require("./xata.client");
const xata = getXataClient();

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
app.use(express.static(path.join(__dirname, "public")));

// Multer: store files in memory
const upload = multer({ storage: multer.memoryStorage() });

// Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// OTP store
const otpStore = {};

// ---------------- UTILS: FORMAT IMAGES ----------------
function formatImages(images) {
  if (!images) return [];
  if (Array.isArray(images)) {
    return images.map((file) => file.url).filter(Boolean);
  }
  return images.url ? [images.url] : [];
}

// ---------------- SELL LISTINGS ----------------
app.get("/api/sell/listings", async (req, res) => {
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  let sortColumn = "xata.createdAt";
  let sortOrder = "desc";

  if (sort === "price_asc") {
    sortColumn = "price";
    sortOrder = "asc";
  } else if (sort === "price_desc") {
    sortColumn = "price";
    sortOrder = "desc";
  }

  let filter = { is_published: true };
  if (search && search.trim() !== "") {
    filter.item_name = { $contains: search };
  }

  const result = await xata.db.sell_listings
    .filter(filter)
    .sort(sortColumn, sortOrder)
    .getPaginated({
      pagination: { size: limit, offset: (page - 1) * limit },
    });

  const listings = result.records.map((l) => ({
    ...l,
    images: formatImages(l.images),
  }));

  res.json({
    listings,
    total: result.totalCount,
    page,
    totalPages: Math.ceil(result.totalCount / limit),
  });
});

// ---------------- SELL FORM + OTP ----------------
app.post("/preowned/sell", upload.array("images"), async (req, res) => {
  const { seller_name = "", email, contact_number = "", whatsapp_number = "", item_name, item_description = "", price = "" } = req.body;

  if (!email || !email.endsWith("@bue.edu.eg"))
    return res.status(400).send("Email must be @bue.edu.eg domain");
  if (!item_name || !price)
    return res.status(400).send("Missing required fields");

  const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > 200 * 1024)
    return res.status(400).send("Total image size cannot exceed 200KB.");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Upload images to Xata
  const uploadedImages = [];
  for (const file of req.files) {
    const uploaded = await xata.files.upload(file.originalname, file.buffer, {
      mediaType: file.mimetype,
    });
    uploadedImages.push(uploaded);
  }

  const record = await xata.db.sell_listings.create({
    seller_name,
    email,
    contact_number,
    whatsapp_number,
    item_name,
    item_description,
    price: parseFloat(price),
    is_published: false,
    images: uploadedImages,
  });

  otpStore[email] = { otp, type: "sell", recordId: record.id };

  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const verifyUrl = `${baseUrl}/verify-otp/sell?email=${encodeURIComponent(email)}`;

  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP for Your Sell Listing",
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });

  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});

app.get("/verify-otp/sell", (req, res) => {
  res.send(`
    <form action="/verify-otp/sell" method="POST">
      <input type="hidden" name="email" value="${req.query.email}" />
      <label>Enter OTP:</label><input name="otp" required />
      <button type="submit">Verify</button>
    </form>
  `);
});

app.post("/verify-otp/sell", async (req, res) => {
  const { email, otp } = req.body;
  const otpData = otpStore[email];

  if (!otpData || otpData.otp !== otp || otpData.type !== "sell")
    return res.status(400).send("Invalid OTP");

  await xata.db.sell_listings.update(otpData.recordId, { is_published: true });
  delete otpStore[email];

  res.send(`<h1>Sell Listing Verified!</h1><a href="/preowned/buy">View listings</a>`);
});

// ---------------- LEASE LISTINGS ----------------
app.get("/api/lease/listings", async (req, res) => {
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  let sortColumn = "xata.createdAt";
  let sortOrder = "desc";

  if (sort === "price_asc") {
    sortColumn = "price";
    sortOrder = "asc";
  } else if (sort === "price_desc") {
    sortColumn = "price";
    sortOrder = "desc";
  }

  let filter = { is_published: true };
  if (search && search.trim() !== "") {
    filter.item_name = { $contains: search };
  }

  const result = await xata.db.lease_listings
    .filter(filter)
    .sort(sortColumn, sortOrder)
    .getPaginated({
      pagination: { size: limit, offset: (page - 1) * limit },
    });

  const listings = result.records.map((l) => ({
    ...l,
    images: formatImages(l.images),
  }));

  res.json({
    listings,
    total: result.totalCount,
    page,
    totalPages: Math.ceil(result.totalCount / limit),
  });
});

app.post("/preowned/lease", upload.array("images"), async (req, res) => {
  const { seller_name = "", email, contact_number = "", whatsapp_number = "", item_name, item_description = "", price, price_period = "" } = req.body;

  if (!email || !email.endsWith("@bue.edu.eg"))
    return res.status(400).send("Email must be @bue.edu.eg domain");
  if (!item_name || !price || !price_period)
    return res.status(400).send("Missing required fields");

  const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > 5 * 1024 * 1024)
    return res.status(400).send("Total image size cannot exceed 5MB.");

  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const uploadedImages = [];
  for (const file of req.files) {
    const uploaded = await xata.files.upload(file.originalname, file.buffer, {
      mediaType: file.mimetype,
    });
    uploadedImages.push(uploaded);
  }

  const record = await xata.db.lease_listings.create({
    seller_name,
    email,
    contact_number,
    whatsapp_number,
    item_name,
    item_description,
    price: parseFloat(price),
    price_period,
    is_published: false,
    images: uploadedImages,
  });

  otpStore[email] = { otp, type: "lease", recordId: record.id };

  const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
  const verifyUrl = `${baseUrl}/verify-otp/lease?email=${encodeURIComponent(email)}`;

  transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP for Your Lease Listing",
    html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
  });

  res.send(`<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`);
});

app.get("/verify-otp/lease", (req, res) => {
  res.send(`
    <form action="/verify-otp/lease" method="POST">
      <input type="hidden" name="email" value="${req.query.email}" />
      <label>Enter OTP:</label><input name="otp" required />
      <button type="submit">Verify</button>
    </form>
  `);
});

app.post("/verify-otp/lease", async (req, res) => {
  const { email, otp } = req.body;
  const otpData = otpStore[email];

  if (!otpData || otpData.otp !== otp || otpData.type !== "lease")
    return res.status(400).send("Invalid OTP");

  await xata.db.lease_listings.update(otpData.recordId, { is_published: true });
  delete otpStore[email];

  res.send(`<h1>Lease Listing Verified!</h1><a href="/preowned/rent">View listings</a>`);
});

// ---------------- SINGLE LISTINGS ----------------
app.get("/api/sell/listings/:id", async (req, res) => {
  const { id } = req.params;
  const record = await xata.db.sell_listings.read(id);

  if (!record || !record.is_published) {
    return res.status(404).send("Listing not found");
  }

  const listing = {
    ...record,
    images: formatImages(record.images),
  };
  res.json(listing);
});

app.get("/api/lease/listings/:id", async (req, res) => {
  const { id } = req.params;
  const record = await xata.db.lease_listings.read(id);

  if (!record || !record.is_published) {
    return res.status(404).send("Listing not found");
  }

  const listing = {
    ...record,
    images: formatImages(record.images),
  };
  res.json(listing);
});

// ---------------- SERVER ----------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
