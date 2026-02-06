const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : (req.body || {});

    const booking = body.booking || {};
    const customerName = body.customerName || "";
    const customerEmail = body.customerEmail || "";

    // validações mínimas
    if (!booking.staffKey || !booking.startISO || !booking.endISO) {
      return res.status(400).json({ error: "Missing booking data." });
    }
    if (!customerEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    const baseUrl =
      process.env.SITE_URL ||
      (req.headers.origin
        ? req.headers.origin
        : `https://${req.headers.host}`);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail,

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

      // ✅ metadata para webhook / backoffice
      metadata: {
        staffKey: booking.staffKey,
        staffName: booking.staffName || "",
        date: booking.date || "",
        startISO: booking.startISO,
        endISO: booking.endISO,
        label: booking.label || "",
        durationMin: String(booking.durationMin || ""),
        customerName,
        customerEmail,
      },

      // ✅ IMPORTANTE: voltar para checkout para auto-clean
      success_url: `${baseUrl}/checkout.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout.html?canceled=1`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return res.status(500).json({
      error: "Failed to create checkout session",
      details: err?.message || String(err),
      type: err?.type || null,
    });
  }
};
