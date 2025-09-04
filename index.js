const { getXataClient } = require("./xata");
const xata = getXataClient();
const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// ---------------- APP SETUP ----------------
process.on("uncaughtException", (err) =>
  console.error("[UNCAUGHT EXCEPTION]", err)
);
process.on("unhandledRejection", (reason) =>
  console.error("[UNHANDLED REJECTION]", reason)
);

const app = express();
const port = process.env.PORT || 3000;

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

// ---------------- ROUTES ----------------
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

// ---------------- SELL LISTINGS ----------------
app.get("/api/sell/listings", async (req, res) => {
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  let order = [];
  if (sort === "asc") order.push({ price: "asc" });
  else if (sort === "desc") order.push({ price: "desc" });
  else order.push({ "xata.createdAt": "desc" });

  const listingsResult = await xata.db.sell_listings
    .filter({
      is_published: true,
      ...(search ? { item_name: { $contains: search } } : {}),
    })
    .sort(order)
    .getPaginated({ pagination: { size: limit, offset: (page - 1) * limit } });

  res.json({
    listings: listingsResult.records,
    total: listingsResult.totalCount,
    page,
    totalPages: Math.ceil(listingsResult.totalCount / limit),
  });
});

app.post("/preowned/sell", upload.array("images"), async (req, res) => {
  try {
    const {
      seller_name = "",
      email,
      contact_number = "",
      whatsapp_number = "",
      item_name,
      item_description = "",
      price,
      price_period = "",
    } = req.body;

    if (!email || !email.endsWith("@bue.edu.eg"))
      return res.status(400).send("Email must be @bue.edu.eg domain");
    if (!item_name || !price)
      return res.status(400).send("Missing required fields");

    // Upload images to Xata
    const imageFiles = [];
    for (const file of req.files) {
      const uploaded = await xata.files.upload({
        name: file.originalname,
        contentType: file.mimetype,
        data: file.buffer,
      });
      imageFiles.push(uploaded);
    }

    const id = uuidv4();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, listingId: id, type: "sell" };

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
      images: imageFiles,
      is_published: false,
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    const verifyUrl = `${baseUrl}/verify-otp/sell?id=${id}&email=${encodeURIComponent(
      email
    )}`;
    transporter.sendMail(
      {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "OTP for Your Sell Listing",
        html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      },
      () => {}
    );
    res.send(
      `<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`
    );
  } catch (err) {
    console.error("Sell listing error:", err);
    res.status(500).send("Failed to create sell listing.");
  }
});

app.get("/verify-otp/sell", (req, res) => {
  res.send(`<form action="/verify-otp/sell" method="POST">
    <input type="hidden" name="id" value="${req.query.id}" />
    <input type="hidden" name="email" value="${req.query.email}" />
    <label>Enter OTP:</label><input name="otp" required />
    <button type="submit">Verify</button>
  </form>`);
});

app.post("/verify-otp/sell", async (req, res) => {
  const { id, email, otp } = req.body;
  const otpData = otpStore[email];
  if (
    !otpData ||
    otpData.otp !== otp ||
    otpData.listingId !== id ||
    otpData.type !== "sell"
  )
    return res.status(400).send("Invalid OTP");

  await xata.db.sell_listings.update(id, { is_published: true });
  delete otpStore[email];
  res.send(
    `<h1>Sell Listing Verified!</h1><a href="/preowned/buy">View listings</a>`
  );
});

// ---------------- LEASE LISTINGS ----------------
app.get("/api/lease/listings", async (req, res) => {
  let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
  page = parseInt(page);
  limit = parseInt(limit);

  let order = [];
  if (sort === "asc") order.push({ price: "asc" });
  else if (sort === "desc") order.push({ price: "desc" });
  else order.push({ "xata.createdAt": "desc" });

  const listingsResult = await xata.db.lease_listings
    .filter({
      is_published: true,
      ...(search ? { item_name: { $contains: search } } : {}),
    })
    .sort(order)
    .getPaginated({ pagination: { size: limit, offset: (page - 1) * limit } });

  res.json({
    listings: listingsResult.records,
    total: listingsResult.totalCount,
    page,
    totalPages: Math.ceil(listingsResult.totalCount / limit),
  });
});

app.post("/preowned/lease", upload.array("images"), async (req, res) => {
  try {
    const {
      seller_name = "",
      email,
      contact_number = "",
      whatsapp_number = "",
      item_name,
      item_description = "",
      price,
      price_period = "",
    } = req.body;

    if (!email || !email.endsWith("@bue.edu.eg"))
      return res.status(400).send("Email must be @bue.edu.eg domain");
    if (!item_name || !price)
      return res.status(400).send("Missing required fields");

    // Upload images to Xata
    const imageFiles = [];
    for (const file of req.files) {
      const uploaded = await xata.files.upload({
        name: file.originalname,
        contentType: file.mimetype,
        data: file.buffer,
      });
      imageFiles.push(uploaded);
    }

    const id = uuidv4();
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, listingId: id, type: "lease" };

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
      images: imageFiles,
      is_published: false,
    });

    const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
    const verifyUrl = `${baseUrl}/verify-otp/lease?id=${id}&email=${encodeURIComponent(
      email
    )}`;
    transporter.sendMail(
      {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "OTP for Your Lease Listing",
        html: `<p>Your OTP: <b>${otp}</b></p><p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
      },
      () => {}
    );
    res.send(
      `<h1>OTP sent to your email!</h1><a href="${verifyUrl}">Verify here</a>`
    );
  } catch (err) {
    console.error("Lease listing error:", err);
    res.status(500).send("Failed to create lease listing.");
  }
});

app.get("/verify-otp/lease", (req, res) => {
  res.send(`<form action="/verify-otp/lease" method="POST">
    <input type="hidden" name="id" value="${req.query.id}" />
    <input type="hidden" name="email" value="${req.query.email}" />
    <label>Enter OTP:</label><input name="otp" required />
    <button type="submit">Verify</button>
  </form>`);
});

app.post("/verify-otp/lease", async (req, res) => {
  const { id, email, otp } = req.body;
  const otpData = otpStore[email];
  if (
    !otpData ||
    otpData.otp !== otp ||
    otpData.listingId !== id ||
    otpData.type !== "lease"
  )
    return res.status(400).send("Invalid OTP");

  await xata.db.lease_listings.update(id, { is_published: true });
  delete otpStore[email];
  res.send(
    `<h1>Lease Listing Verified!</h1><a href="/preowned/rent">View listings</a>`
  );
});

// ---------------- SERVER ----------------
app.listen(port, () => console.log(`Server running on port ${port}`));
