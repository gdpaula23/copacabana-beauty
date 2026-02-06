const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function safeStr(v){ return (v == null) ? "" : String(v); }

function getStaffDisplay(booking){
  const key = safeStr(booking.staffKey).toLowerCase();
  if (key === "duo") return "DUO Service";
  // se vier vazio, tenta cair pro staffKey
  const name = safeStr(booking.staffName).trim();
  if (name) return name;
  if (key === "ana") return "Ana Paula";
  if (key === "glenda") return "Glenda Garcia";
  return key || "Staff";
}

function getWhenDisplay(booking){
  // booking.date já está YYYY-MM-DD no seu fluxo
  const date = safeStr(booking.date).trim();
  const label = safeStr(booking.label).trim(); // "HH:MM"
  const when = [date, label].filter(Boolean).join(" · ");
  return when || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : (req.body || {});

    const booking = body.booking || {};
    const customerName = safeStr(body.customerName).trim();
    const customerEmail = safeStr(body.customerEmail).trim();

    // validações mínimas
    if (!booking.staffKey || !booking.startISO || !booking.endISO) {
      return res.status(400).json({ error: "Missing booking data." });
    }
    if (!customerEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    const staffDisplay = getStaffDisplay(booking);
    const whenDisplay = getWhenDisplay(booking);

    const baseUrl =
      process.env.SITE_URL ||
      (req.headers.origin
        ? req.headers.origin
        : `https://${req.headers.host}`);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      automatic_payment_methods: { enabled: true },
      customer_email: customerEmail,

      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Copacabana Beauty — Deposit (${staffDisplay})`,
              // ✅ aparece no Stripe/Dashboard e ajuda muito no backoffice
              description: whenDisplay ? `Appointment: ${whenDisplay}` : undefined,
            },
            unit_amount: 2000, // £20
          },
          quantity: 1,
        },
      ],

      // ✅ metadata para webhook / backoffice
      metadata: {
        staffKey: safeStr(booking.staffKey),
        staffName: staffDisplay, // ✅ garante que DUO não fique vazio
        date: safeStr(booking.date),
        startISO: safeStr(booking.startISO),
        endISO: safeStr(booking.endISO),
        label: safeStr(booking.label),
        durationMin: safeStr(booking.durationMin || ""),
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
