const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: "missing session_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    return res.json({
      id: session.id,
      metadata: session.metadata,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
