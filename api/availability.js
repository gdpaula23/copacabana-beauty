import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    const serviceAccount = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    );

    const auth = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ["https://www.googleapis.com/auth/calendar"]
    );

    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 7); // próximos 7 dias

    const calendars = [
      {
        name: "Ana Paula",
        id: process.env.CALENDAR_ID_ANA,
      },
      {
        name: "Glenda Garcia",
        id: process.env.CALENDAR_ID_GLENDA,
      },
    ];

    const results = {};

    for (const staff of calendars) {
      const events = await calendar.events.list({
        calendarId: staff.id,
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      results[staff.name] = events.data.items.map(e => ({
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
      }));
    }

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar agenda" });
  }
}
