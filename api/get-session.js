const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method Not Allowed");

  try {
    const sessionId = req.query.session_id;
    if (!sessionId) return res.status(400).json({ ok: false, error: "Missing session_id" });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return res.status(200).json({
      ok: true,
      id: session.id,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email || session.customer_email || "",
      metadata: session.metadata || {},
    });
  } catch (err) {
    console.error("get-session error:", err);
    return res.status(500).json({ ok: false, error: "Failed to retrieve session" });
  }
};
