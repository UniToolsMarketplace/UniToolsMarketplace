const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { getXataClient } = require("./xata");
require("dotenv").config();

console.log("DEBUG: ENV VARS");
console.log("XATA_API_KEY:", process.env.XATA_API_KEY ? "[SET]" : "[NOT SET]");
console.log("XATA_DATABASE_URL:", process.env.XATA_DATABASE_URL);

const app = express();
const xata = getXataClient();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));

// ---------------- EMAIL SETUP ----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------------- OTP STORAGE ----------------
const otpStore = {};

// ---------------- MULTER SETUP ----------------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------------- ROUTES ----------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/preowned/sell", upload.array("images"), async (req, res) => {
  const { seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period } = req.body;

  if (!email.endsWith("@bue.edu.eg")) {
    return res.send("Only @bue.edu.eg emails allowed.");
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, formData: req.body, files: req.files, type: "sell" };

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP Verification",
    text: `Your OTP is ${otp}`,
  });

  res.send("OTP sent to your email. Please check and verify.");
});

app.post("/preowned/lease", upload.array("images"), async (req, res) => {
  const { seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period } = req.body;

  if (!email.endsWith("@bue.edu.eg")) {
    return res.send("Only @bue.edu.eg emails allowed.");
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, formData: req.body, files: req.files, type: "lease" };

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP Verification",
    text: `Your OTP is ${otp}`,
  });

  res.send("OTP sent to your email. Please check and verify.");
});

app.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  const stored = otpStore[email];
  if (!stored || stored.otp !== otp) {
    return res.send("Invalid OTP.");
  }

  const { formData, files, type } = stored;
  let tableName = type === "sell" ? "sell_listings" : "lease_listings";

  let uploadedFiles = [];
  if (files && files.length > 0) {
    for (const file of files) {
      const uploaded = await xata.files.upload(file.originalname, file.buffer, file.mimetype);
      uploadedFiles.push(uploaded);
    }
  }

  await xata.db[tableName].create({
    id: uuidv4(),
    ...formData,
    price: parseFloat(formData.price),
    images: uploadedFiles,
    is_published: true,
  });

  delete otpStore[email];

  if (type === "sell") {
    res.send('Listing verified and published! <a href="/buy">View Buy Listings</a>');
  } else {
    res.send('Listing verified and published! <a href="/rent">View Lease Listings</a>');
  }
});

// ---------------- BUY PAGE ----------------
app.get("/buy", async (req, res) => {
  const listings = await xata.db.sell_listings.filter("is_published", true).getMany();

  const listingsHtml = listings.map(l => {
    const images = Array.isArray(l.images) ? l.images : (l.images ? [l.images] : []);
    const imageTags = images.map(img =>
      `<img src="${img.url}" alt="Listing Image" style="max-width:150px; margin:5px;" />`
    ).join("");

    return `
      <div class="listing">
        <h3>${l.item_name}</h3>
        <p>${l.item_description || ""}</p>
        <p><strong>Price:</strong> ${l.price} ${l.price_period || ""}</p>
        ${imageTags}
      </div>
    `;
  }).join("");

  res.send(`
    <html>
      <head><title>Buy Listings</title></head>
      <body>
        <h1>Buy Listings</h1>
        ${listingsHtml || "<p>No listings yet.</p>"}
      </body>
    </html>
  `);
});

// ---------------- RENT PAGE ----------------
app.get("/rent", async (req, res) => {
  const listings = await xata.db.lease_listings.filter("is_published", true).getMany();

  const listingsHtml = listings.map(l => {
    const images = Array.isArray(l.images) ? l.images : (l.images ? [l.images] : []);
    const imageTags = images.map(img =>
      `<img src="${img.url}" alt="Listing Image" style="max-width:150px; margin:5px;" />`
    ).join("");

    return `
      <div class="listing">
        <h3>${l.item_name}</h3>
        <p>${l.item_description || ""}</p>
        <p><strong>Price:</strong> ${l.price} ${l.price_period || ""}</p>
        ${imageTags}
      </div>
    `;
  }).join("");

  res.send(`
    <html>
      <head><title>Lease Listings</title></head>
      <body>
        <h1>Lease Listings</h1>
        ${listingsHtml || "<p>No listings yet.</p>"}
      </body>
    </html>
  `);
});

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
