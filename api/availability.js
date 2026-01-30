import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    const calendarAna = process.env.CALENDAR_ID_ANA;
    const calendarGlenda = process.env.CALENDAR_ID_GLENDA;

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return res.status(500).json({ ok: false, error: "Missing GOOGLE_SERVICE_ACCOUNT_JSON" });
    }
    if (!calendarAna || !calendarGlenda) {
      return res.status(500).json({ ok: false, error: "Missing CALENDAR_ID_ANA or CALENDAR_ID_GLENDA" });
    }

    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        // sem timeZone
        items: [{ id: calendarAna }, { id: calendarGlenda }],
      },
    });

    return res.status(200).json({
      ok: true,
      range: { timeMin, timeMax },
      calendars: {
        ana: { id: calendarAna, busy: fb.data.calendars?.[calendarAna]?.busy || [] },
        glenda: { id: calendarGlenda, busy: fb.data.calendars?.[calendarGlenda]?.busy || [] },
      },
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: "Erro ao buscar agenda",
      error: e?.message || String(e),
      details: e?.response?.data || null,
    });
  }
}
