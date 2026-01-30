const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const baseUrl =
      process.env.SITE_URL ||
      (req.headers.origin ? req.headers.origin : `https://${req.headers.host}`);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: { name: "Copacabana Beauty — Deposit" },
            unit_amount: 2000, // £20
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout.html?canceled=1`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
  console.error("Stripe error:", err);
  return res.status(500).json({
    error: "Failed to create checkout session",
    details: err?.message || String(err),
    type: err?.type || null,
  });
}
};
