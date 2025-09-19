const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
require("dotenv").config();
const { v2: cloudinary } = require("cloudinary");
const { createClient } = require("@supabase/supabase-js");

// ---------------- SUPABASE SETUP ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/index.html")));
app.get("/preowned/sell", (req, res) => res.sendFile(path.join(__dirname, "public/sell.html")));
app.get("/preowned/buy", (req, res) => res.sendFile(path.join(__dirname, "public/buy.html")));
app.get("/preowned/lease", (req, res) => res.sendFile(path.join(__dirname, "public/lease.html")));
app.get("/preowned/rent", (req, res) => res.sendFile(path.join(__dirname, "public/rent.html")));
app.get("/listing/:id", (req, res) => res.sendFile(path.join(__dirname, "public/listing.html")));
app.get("/faculties", (req, res) => res.sendFile(path.join(__dirname, "public/faculties.html")));
app.get("/dentistry", (req, res) => res.sendFile(path.join(__dirname, "public/dentistry.html")));
app.get("/preowned", (req, res) => res.sendFile(path.join(__dirname, "public/preowned.html")));

// ---------------- SELL LISTINGS WITH PAGINATION, SORT, SEARCH ----------------
app.get("/api/sell/listings", async (req, res) => {
  try {
    let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    let orderCol = "created_at";
    let orderDir = { ascending: false };

    if (sort === "price_asc") {
      orderCol = "price";
      orderDir = { ascending: true };
    } else if (sort === "price_desc") {
      orderCol = "price";
      orderDir = { ascending: false };
    }

    let query = supabase
      .from("sell_listings")
      .select("*", { count: "exact" })
      .eq("is_published", true)
      .order(orderCol, orderDir);

    if (search && search.trim() !== "") {
      query = query.ilike("item_name", `%${search}%`);
    }

    const { data, error, count } = await query
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    res.json({
      listings: data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ---------------- SELL FORM + OTP ----------------
app.post("/preowned/sell", upload.array("images"), async (req, res) => {
  try {
    const { seller_name = "", email, contact_number = "", whatsapp_number = "", item_name, item_description = "", price = "" } = req.body;

    if (!email || !email.endsWith("@bue.edu.eg"))
      return res.status(400).send("Email must be @bue.edu.eg domain");
    if (!item_name || !price) return res.status(400).send("Missing required fields");

    const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 5 * 1024 * 1024)
      return res.status(400).send("Total image size cannot exceed 5MB.");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Cloudinary upload
    const cloudinaryUpload = (file) =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "unitools" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });

    const uploadedUrls = [];
    for (const file of req.files) {
      try {
        const url = await cloudinaryUpload(file);
        uploadedUrls.push(url);
      } catch (err) {
        console.error("Cloudinary upload error:", err);
      }
    }

    console.log("DEBUG: Final images being saved:", uploadedUrls);

    const { data, error } = await supabase.from("sell_listings").insert([{
      seller_name,
      email,
      contact_number,
      whatsapp_number,
      item_name,
      item_description,
      price: parseFloat(price),
      is_published: false,
      images: uploadedUrls, // Save all URLs as array
    }]).select();

    if (error) throw error;

    const record = data[0];
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
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ---------------- VERIFY OTP FOR SELL ----------------
app.get("/verify-otp/sell", (req, res) => {
  const { email } = req.query;
  if (!email || !otpStore[email]) {
    return res.status(400).send("Invalid or expired OTP session.");
  }

  res.send(`
    <h1>Verify OTP for Sell Listing</h1>
    <form method="POST" action="/verify-otp/sell">
      <input type="hidden" name="email" value="${email}" />
      <label>Enter OTP: <input type="text" name="otp" /></label>
      <button type="submit">Verify</button>
    </form>
  `);
});

app.post("/verify-otp/sell", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const session = otpStore[email];

    if (!session || session.otp !== otp) {
      return res.status(400).send("Invalid OTP");
    }

    const { error } = await supabase
      .from("sell_listings")
      .update({ is_published: true })
      .eq("id", session.recordId);

    if (error) throw error;

    delete otpStore[email];

    res.send("<h1>Listing verified and published!</h1><a href='/preowned/buy'>View your Listing on the Buy Page</a>");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ---------------- LEASE FORM + OTP ----------------
app.post("/preowned/lease", upload.array("images"), async (req, res) => {
  try {
    const { seller_name = "", email, contact_number = "", whatsapp_number = "", item_name, item_description = "", price = "", price_period = "" } = req.body;

    if (!email || !email.endsWith("@bue.edu.eg"))
      return res.status(400).send("Email must be @bue.edu.eg domain");
    if (!item_name || !price || !price_period) return res.status(400).send("Missing required fields");

    const totalSize = req.files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > 5 * 1024 * 1024)
      return res.status(400).send("Total image size cannot exceed 5MB.");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Cloudinary upload
    const cloudinaryUpload = (file) =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "unitools" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        stream.end(file.buffer);
      });

    const uploadedUrls = [];
    for (const file of req.files) {
      try {
        const url = await cloudinaryUpload(file);
        uploadedUrls.push(url);
      } catch (err) {
        console.error("Cloudinary upload error:", err);
      }
    }

    console.log("DEBUG: Final images being saved (lease):", uploadedUrls);

    const { data, error } = await supabase.from("lease_listings").insert([{
      seller_name,
      email,
      contact_number,
      whatsapp_number,
      item_name,
      item_description,
      price: parseFloat(price),
      price_period,
      is_published: false,
      images: uploadedUrls, // Save all URLs as array
    }]).select();

    if (error) throw error;

    const record = data[0];
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
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ---------------- VERIFY OTP FOR LEASE ----------------
app.get("/verify-otp/lease", (req, res) => {
  const { email } = req.query;
  if (!email || !otpStore[email]) {
    return res.status(400).send("Invalid or expired OTP session.");
  }

  res.send(`
    <h1>Verify OTP for Lease Listing</h1>
    <form method="POST" action="/verify-otp/lease">
      <input type="hidden" name="email" value="${email}" />
      <label>Enter OTP: <input type="text" name="otp" /></label>
      <button type="submit">Verify</button>
    </form>
  `);
});

app.post("/verify-otp/lease", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const session = otpStore[email];

    if (!session || session.otp !== otp) {
      return res.status(400).send("Invalid OTP");
    }

    const { error } = await supabase
      .from("lease_listings")
      .update({ is_published: true })
      .eq("id", session.recordId);

    if (error) throw error;

    delete otpStore[email];

    res.send("<h1>Lease listing verified and published!</h1><a href='/preowned/rent'>View Your Listing on the Rent Page</a>");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ---------------- LEASE LISTINGS FETCH ----------------
app.get("/api/lease/listings", async (req, res) => {
  try {
    let { page = 1, limit = 5, sort = "none", search = "" } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    let orderCol = "created_at";
    let orderDir = { ascending: false };

    if (sort === "price_asc") {
      orderCol = "price";
      orderDir = { ascending: true };
    } else if (sort === "price_desc") {
      orderCol = "price";
      orderDir = { ascending: false };
    }

    let query = supabase
      .from("lease_listings")
      .select("*", { count: "exact" })
      .eq("is_published", true)
      .order(orderCol, orderDir);

    if (search && search.trim() !== "") {
      query = query.ilike("item_name", `%${search}%`);
    }

    const { data, error, count } = await query
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    res.json({
      listings: data,
      total: count,
      page,
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ---------------- FETCH SINGLE LISTINGS ----------------
app.get("/api/sell/listings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("sell_listings")
      .select("*")
      .eq("id", id)
      .eq("is_published", true)
      .single();

    if (error || !data) return res.status(404).send("Listing not found");

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/api/lease/listings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("lease_listings")
      .select("*")
      .eq("id", id)
      .eq("is_published", true)
      .single();

    if (error || !data) return res.status(404).send("Listing not found");

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// ---------------- SERVER ----------------
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
