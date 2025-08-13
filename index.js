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

// Multer setup for image uploads
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

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

const LISTINGS_FILE = path.join(__dirname, 'listingsforsale.json');
function readListings() {
  try {
    const data = fs.readFileSync(LISTINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch { return []; }
}
function writeListings(listings) {
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2));
}

// OTP store
const otpStore = {};

// Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/preowned/sell', (req, res) => res.sendFile(path.join(__dirname, 'public/sell.html')));
app.get('/preowned/buy', (req, res) => res.sendFile(path.join(__dirname, 'public/buy.html')));

// API for buy page
app.get('/api/listings', (req, res) => {
  const listings = readListings().filter(l => l.isPublished);
  res.json(listings);
});
app.get('/api/listings/:id', (req, res) => {
  const listings = readListings();
  const listing = listings.find(l => l.id === req.params.id && l.isPublished);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  res.json(listing);
});

// POST sell form
app.post('/preowned/sell', upload.array('images', 5), (req, res) => {
  const { sellerName='', email, contactNumber='', whatsappNumber='', itemName, itemDescription='', price, pricePeriod='' } = req.body;

  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!itemName || !price) return res.status(400).send('Missing required fields');

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random()*900000).toString();
  otpStore[email] = { otp, listingId: id };

  const images = req.files ? req.files.map(f => `/uploads/pending/${f.filename}`) : [];

  const listings = readListings();
  listings.push({
    id, sellerName, email, contactNumber, whatsappNumber,
    itemName, itemDescription,
    price: parseFloat(price),
    pricePeriod, images,
    isPublished: false, otpVerified: false, otpSentAt: Date.now(),
  });
  writeListings(listings);

  const verifyUrl = `http://localhost:${port}/verify-otp?id=${id}&email=${encodeURIComponent(email)}`;
  const manageUrl = `http://localhost:${port}/manage/${id}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'OTP for Your Dental Tool Listing',
    html: `
      <p>Your OTP: <b>${otp}</b></p>
      <p>Verify your listing: <a href="${verifyUrl}">${verifyUrl}</a></p>
      <hr />
      <p>Manage your listing: <a href="${manageUrl}">${manageUrl}</a></p>
    `
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) { console.error(err); return res.status(500).send('Failed to send OTP email'); }
    console.log('Email sent:', info.response);
    res.send(`<h1>OTP sent to your email!</h1><p>Check your inbox. <a href="${verifyUrl}">Click here to verify</a></p>`);
  });
});

// GET verify OTP form
app.get('/verify-otp', (req, res) => {
  const { id, email } = req.query;
  if (!id || !email) return res.status(400).send('Invalid verify link');
  res.send(`
    <h1>Verify OTP</h1>
    <form action="/verify-otp" method="POST">
      <input type="hidden" name="id" value="${id}" />
      <input type="hidden" name="email" value="${email}" />
      <label>Enter OTP sent to ${email}:</label><br/>
      <input name="otp" required /><br/><br/>
      <button type="submit">Verify OTP</button>
    </form>
  `);
});

// POST verify OTP
app.post('/verify-otp', (req, res) => {
  const { id, email, otp } = req.body;
  if (!id || !email || !otp) return res.status(400).send('Missing data');

  const otpData = otpStore[email];
  if (!otpData || otpData.otp !== otp || otpData.listingId !== id) return res.status(400).send('Invalid OTP');

  let listings = readListings();
  const listing = listings.find(l => l.id === id && l.email === email);
  if (!listing) return res.status(404).send('Listing not found');

  listing.isPublished = true;
  listing.otpVerified = true;

  // Move images from pending to active
  listing.images = listing.images.map(imgPath => {
    const oldPath = path.join(__dirname, imgPath);
    const newDir = path.join(__dirname, 'uploads/active');
    if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    const newPath = path.join(newDir, path.basename(imgPath));
    fs.renameSync(oldPath, newPath);
    return `/uploads/active/${path.basename(imgPath)}`;
  });

  writeListings(listings);
  delete otpStore[email];

  res.send(`<h1>Listing verified!</h1>
    <p><a href="/manage/${id}">Manage your listing</a></p>
    <p><a href="/preowned/buy">View all listings</a></p>
  `);
});

// Manage listing
app.get('/manage/:id', (req, res) => {
  const listings = readListings();
  const listing = listings.find(l => l.id === req.params.id);
  if (!listing) return res.status(404).send('Listing not found');

  res.send(`
    <h1>Manage Listing</h1>
    <p><strong>Item Name:</strong> ${listing.itemName}</p>
    <p><strong>Description:</strong> ${listing.itemDescription}</p>
    <p><strong>Price:</strong> ${listing.price.toLocaleString('en-US', { style:'currency', currency:'EGP'})}</p>
    <p>
      <a href="/manage/${listing.id}/edit">Edit</a> |
      <a href="/manage/${listing.id}/delete" onclick="return confirm('Are you sure?')">Delete</a>
    </p>
  `);
});
app.get('/manage/:id/delete', (req,res) => {
  let listings = readListings();
  const id = req.params.id;
  listings = listings.filter(l => l.id !== id);
  writeListings(listings);
  res.send(`<h1>Deleted</h1><p><a href="/preowned/buy">Back to Buy Tools</a></p>`);
});

// Notify contact view
app.post('/api/contact-viewed', (req,res) => {
  const { listingId, contactType } = req.body;
  console.log(`Buyer viewed ${contactType} for listing ${listingId}`);
  res.json({ message: 'Notification received' });
});

// Listing page
app.get('/listing/:id', (req,res) => res.sendFile(path.join(__dirname,'public/listing.html')));

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));


// Serve lease/rent pages
app.get('/preowned/lease', (req, res) => res.sendFile(path.join(__dirname, 'public', 'lease.html')));
app.get('/preowned/rent', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rent.html')));

// Lease/Rent listings API
app.get('/api/rent', (req, res) => {
  const listings = readListings().filter(l => l.isPublished && (l.listingType === 'lease' || l.listingType === 'rent'));
  res.json(listings);
});

// POST /preowned/lease (same as sell, just type = 'lease')
app.post('/preowned/lease', upload.array('images', 5), (req, res) => {
  const { sellerName='', email, contactNumber='', whatsappNumber='', itemName, itemDescription='', price, pricePeriod='' } = req.body;
  if (!email || !email.endsWith('@bue.edu.eg')) return res.status(400).send('Email must be @bue.edu.eg domain');
  if (!itemName || !price) return res.status(400).send('Missing required fields');

  const id = uuidv4();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = { otp, listingId: id };

  const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
  const listings = readListings();
  listings.push({
    id, sellerName, email, contactNumber, whatsappNumber,
    itemName, itemDescription,
    price: parseFloat(price),
    pricePeriod,
    images, isPublished: false,
    otpVerified: false,
    otpSentAt: Date.now(),
    listingType: 'lease'
  });
  writeListings(listings);

  const verifyUrl = `http://localhost:${port}/verify-otp?id=${id}&email=${encodeURIComponent(email)}`;
  const manageUrl = `http://localhost:${port}/manage/${id}`;
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for Lease Tool Listing',
    html: `<p>Your OTP: <b>${otp}</b></p>
           <p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>
           <p>Manage: <a href="${manageUrl}">${manageUrl}</a></p>`
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) return res.status(500).send('Failed to send OTP email');
    res.send('OTP sent to your email! Please check and verify.');
  });
});

// Add a route to show individual rent pages (optional)
app.get('/rent/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'rent.html'));
});
