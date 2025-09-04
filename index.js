const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

// ---------------- ERROR HANDLER ----------------
process.on("uncaughtException", (err) => {
  console.error("[UNCAUGHT EXCEPTION]", err);
});

// ---------------- APP SETUP ----------------
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------- MULTER SETUP ----------------
const upload = multer();

// ---------------- XATA SETUP ----------------
const { getXataClient } = require("./xata");
const xata = getXataClient();

// ---------------- ROUTES ----------------

// Test route
app.get("/ping", (req, res) => {
  res.send("pong");
});

// ---------------- SELL LISTING ----------------
app.post("/api/sell/listings", upload.array("images"), async (req, res) => {
  try {
    const { seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    // Upload images to Xata
    const imageRefs = [];
    for (const file of req.files) {
      if (!file || !file.buffer) {
        throw new Error("Invalid file upload");
      }

      const uploaded = await xata.files.upload({
        name: file.originalname,
        mediaType: file.mimetype,
        data: file.buffer,
      });

      imageRefs.push(uploaded);
    }

    // Create record in Xata
    const newListing = await xata.db.sell_listings.create({
      id: uuidv4(),
      seller_name,
      email,
      contact_number,
      whatsapp_number,
      item_name,
      item_description,
      price: parseFloat(price),
      price_period,
      images: imageRefs,
      is_published: true,
    });

    res.status(201).json({ message: "Sell listing created successfully", listing: newListing });

  } catch (err) {
    console.error("[ERROR creating sell listing]", err);
    res.status(500).send("Failed to create sell listing. " + err.message);
  }
});

// ---------------- LEASE LISTING ----------------
app.post("/api/lease/listings", upload.array("images"), async (req, res) => {
  try {
    const { seller_name, email, contact_number, whatsapp_number, item_name, item_description, price, price_period } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No images uploaded" });
    }

    // Upload images to Xata
    const imageRefs = [];
    for (const file of req.files) {
      if (!file || !file.buffer) {
        throw new Error("Invalid file upload");
      }

      const uploaded = await xata.files.upload({
        name: file.originalname,
        mediaType: file.mimetype,
        data: file.buffer,
      });

      imageRefs.push(uploaded);
    }

    // Create record in Xata
    const newListing = await xata.db.lease_listings.create({
      id: uuidv4(),
      seller_name,
      email,
      contact_number,
      whatsapp_number,
      item_name,
      item_description,
      price: parseFloat(price),
      price_period,
      images: imageRefs,
      is_published: true,
    });

    res.status(201).json({ message: "Lease listing created successfully", listing: newListing });

  } catch (err) {
    console.error("[ERROR creating lease listing]", err);
    res.status(500).send("Failed to create lease listing. " + err.message);
  }
});

// ---------------- START SERVER ----------------
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
