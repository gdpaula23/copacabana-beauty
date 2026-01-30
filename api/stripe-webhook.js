const Stripe = require("stripe");
const { google } = require("googleapis");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe precisa do raw body para validar assinatura
async function getRawBody(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function getCalendarClient() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  return google.calendar({ version: "v3", auth });
}

function calendarIdForStaff(staffKey) {
  if (staffKey === "ana") return process.env.CALENDAR_ID_ANA;
  if (staffKey === "glenda") return process.env.CALENDAR_ID_GLENDA;
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  let event;

  try {
    const sig = req.headers["stripe-signature"];
    const rawBody = await getRawBody(req);

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // só processa se pago
      if (session.payment_status !== "paid") {
        return res.status(200).json({ received: true, ignored: "not_paid" });
      }

      const md = session.metadata || {};
      const staffKey = md.staffKey;
      const staffName = md.staffName || staffKey;
      const startISO = md.startISO;
      const endISO = md.endISO;

      const customerName = md.customerName || "";
      const customerEmail =
        md.customerEmail || session.customer_details?.email || "";

      if (!staffKey || !startISO || !endISO) {
        console.error("Missing required metadata:", md);
        return res.status(200).json({ received: true, ignored: "missing_metadata" });
      }

      const calendarId = calendarIdForStaff(staffKey);
      if (!calendarId) {
        console.error("Invalid staffKey:", staffKey);
        return res.status(200).json({ received: true, ignored: "invalid_staff" });
      }

      const calendar = getCalendarClient();

      // ✅ proteção anti-duplicado:
      // Vamos buscar eventos no mesmo intervalo e checar se já existe session.id na descrição
      const existing = await calendar.events.list({
        calendarId,
        timeMin: startISO,
        timeMax: endISO,
        singleEvents: true,
        orderBy: "startTime",
      });

      const already = (existing.data.items || []).some((ev) =>
        (ev.description || "").includes(`Stripe session: ${session.id}`)
      );

      if (already) {
        return res.status(200).json({ received: true, skipped: "duplicate" });
      }

      const summary = `Booking — ${customerName || customerEmail || "Client"}`;
      const description = [
        `Staff: ${staffName}`,
        `Client: ${customerName}`,
        `Email: ${customerEmail}`,
        `Stripe session: ${session.id}`,
      ].filter(Boolean).join("\n");

      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary,
          description,
          start: { dateTime: startISO },
          end: { dateTime: endISO },
        },
      });

      return res.status(200).json({ received: true, created: true });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook handler failed:", err);
    return res.status(500).json({ error: "Webhook failed" });
  }
};
