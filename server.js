require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST']
}));

// In-Memory Lead Store (Replace with Supabase/MongoDB connection if persistent storage is needed)
const leadsDatabase = [];

// Health check endpoint for hosting service
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Primary Lead & Reservation Intent Endpoint
app.post('/api/reserve', async (req, res) => {
  const { email, location, feedback, loiIntent } = req.body;

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

  // Send Non-Binding Email if user checked the Beta LOI intent option
  try {
    if (loiIntent && process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'Smart Shelf <onboarding@resend.dev>', // Replace with your domain once verified
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
    // Still return success to frontend if lead was saved
    return res.status(200).json({
      success: true,
      message: 'Reservation recorded, but verification email failed to dispatch.',
      leadId: lead.id
    });
  }
});

// Admin endpoint to view saved leads
app.get('/api/leads', (req, res) => {
  res.status(200).json({
    total: leadsDatabase.length,
    leads: leadsDatabase
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});