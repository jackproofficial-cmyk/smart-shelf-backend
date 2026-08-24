require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();

// 1. CORS: explicit allow-list instead of open wildcard.
// Add any other frontend origins here (e.g. a custom domain later).
const allowedOrigins = [
  'https://smartshelfs.netlify.app',
  'http://localhost:3000', // local dev — remove if unused
  'http://127.0.0.1:5500'  // Live Server / VS Code preview — remove if unused
];

const corsOptions = {
  origin(origin, callback) {
    // allow non-browser tools (curl, health checks) with no Origin header
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Admin-Key']
};

app.use(cors(corsOptions));
// Express 5 + cors handles OPTIONS preflight automatically — no extra app.options() needed.

// 2. Parse JSON payloads
app.use(express.json());

const resend = new Resend(process.env.RESEND_API_KEY);

// In-Memory Lead Store
// NOTE: this resets on every deploy/restart/free-tier sleep cycle.
// Fine for a quick demo, but you will lose real signups. Swap in a
// real store (Postgres, Airtable, Google Sheet, etc.) before launch.
const leadsDatabase = [];

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Primary Lead & Reservation Intent Endpoint
app.post('/api/reserve', async (req, res) => {
  const { email, location, feedback, loiIntent } = req.body || {};

  if (!email || !location) {
    return res.status(400).json({
      success: false,
      error: 'Email address and primary shelf location are required.'
    });
  }

  // Create lead record with status tracking
  const lead = {
    id: `lead_${Date.now()}`,
    email,
    location,
    feedback: feedback || '',
    loiIntent: Boolean(loiIntent),
    status: loiIntent ? 'PENDING_CONFIRMATION' : 'REGISTERED',
    createdAt: new Date().toISOString()
  };

  leadsDatabase.push(lead);
  console.log('New Lead Stored:', lead);

  // Send Non-Binding Email via Resend
  try {
    if (loiIntent && process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Smart Shelf <onboarding@resend.dev>',
        to: email,
        subject: 'Confirm your Smart Shelf Beta Reservation Intent',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; color: #24211e;">
            <h2>Confirm Your Early Access Intent</h2>
            <p>Thank you for registering your interest in Smart Shelf for your <strong>${location}</strong>.</p>
            <p>We have logged your request to secure an early-access beta unit with a planned €50 deposit.</p>
            <div style="background: #f2ede4; border-left: 4px solid #9e825c; padding: 14px; margin: 20px 0;">
              <strong>Note:</strong> This reservation carries <strong>no obligation</strong>. Confirming your spot does not obligate you to pay the €50 deposit now or in the future. You can cancel anytime.
            </div>
            <p>Please reply <strong>"CONFIRM"</strong> directly to this email to lock in your priority spot in our initial hardware batch.</p>
            <br>
            <p>Best regards,<br><strong>The Smart Shelf Team</strong></p>
          </div>
        `
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reservation recorded successfully.',
      leadId: lead.id
    });
  } catch (emailError) {
    console.error('Email Dispatch Failed:', emailError);
    return res.status(200).json({
      success: true,
      message: 'Reservation recorded, but verification email failed to dispatch.',
      leadId: lead.id
    });
  }
});

// Admin endpoint to view saved leads — now requires a key.
// Set ADMIN_KEY in Render's environment variables, then call with
// header: X-Admin-Key: <your key>
app.get('/api/leads', (req, res) => {
  const key = req.header('X-Admin-Key');
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.status(200).json({
    total: leadsDatabase.length,
    leads: leadsDatabase
  });
});

// CORS error handler — turns the thrown CORS error into a clean 403
// instead of a generic Express 500/stack trace.
app.use((err, req, res, next) => {
  if (err && err.message && err.message.startsWith('CORS blocked')) {
    return res.status(403).json({ success: false, error: err.message });
  }
  next(err);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
