import { google } from "googleapis";

function parseServiceAccount(jsonStr) {
  const obj = JSON.parse(jsonStr);
  // Corrige \n do private_key quando vem pela env var
  if (obj.private_key && obj.private_key.includes("\\n")) {
    obj.private_key = obj.private_key.replace(/\\n/g, "\n");
  }
  return obj;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addMinutes(d, m) {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + m);
  return x;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function buildSlotsForDay(dayDate, { startHour, endHour, stepMinutes, durationMinutes }) {
  const day = new Date(dayDate);

  const start = new Date(day);
  start.setHours(startHour, 0, 0, 0);

  const end = new Date(day);
  end.setHours(endHour, 0, 0, 0);

  const slots = [];
  for (let t = new Date(start); t < end; t = addMinutes(t, stepMinutes)) {
    const s = new Date(t);
    const e = addMinutes(s, durationMinutes);
    if (e <= end) slots.push({ start: s, end: e });
  }
  return slots;
}

function filterBusy(slots, busyRanges) {
  return slots.filter(slot => {
    return !busyRanges.some(b => overlaps(slot.start, slot.end, b.start, b.end));
  });
}

function hhmm(date) {
  // HH:MM em UTC do servidor; no front a gente pode formatar melhor depois.
  // Para já, isso funciona.
  return date.toISOString().slice(11, 16);
}

export default async function handler(req, res) {
  try {
    const calendarAna = process.env.CALENDAR_ID_ANA;
    const calendarGlenda = process.env.CALENDAR_ID_GLENDA;
    const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!calendarAna || !calendarGlenda) {
      return res.status(500).json({ ok: false, error: "Missing CALENDAR_ID_ANA or CALENDAR_ID_GLENDA" });
    }
    if (!saJson) {
      return res.status(500).json({ ok: false, error: "Missing GOOGLE_SERVICE_ACCOUNT_JSON" });
    }

    const sa = parseServiceAccount(saJson);

    const auth = new google.auth.JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const calendar = google.calendar({ version: "v3", auth });

    // ===== Config (você edita depois) =====
    const days = Number(req.query.days || 14);
    const startHour = Number(req.query.startHour || 9);
    const endHour = Number(req.query.endHour || 18);
    const stepMinutes = Number(req.query.step || 15);
    const durationMinutes = Number(req.query.duration || 60);

    const now = new Date();
    const rangeStart = startOfDay(now);
    const rangeEnd = addMinutes(rangeStart, days * 24 * 60);

    // FreeBusy (ocupados)
    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: rangeStart.toISOString(),
        timeMax: rangeEnd.toISOString(),
        items: [{ id: calendarAna }, { id: calendarGlenda }],
      },
    });

    const calBusy = fb.data.calendars || {};
    const anaBusy = (calBusy[calendarAna]?.busy || []).map(b => ({ start: new Date(b.start), end: new Date(b.end) }));
    const glendaBusy = (calBusy[calendarGlenda]?.busy || []).map(b => ({ start: new Date(b.start), end: new Date(b.end) }));

    // Gera days + slots
    const out = {
      ok: true,
      timeZone: "Europe/London", // só pra exibir; não depende de ENV
      range: { timeMin: rangeStart.toISOString(), timeMax: rangeEnd.toISOString() },
      staff: {
        ana: { name: "Ana Paula" },
        glenda: { name: "Glenda Garcia" },
      },
      days: [],
    };

    for (let i = 0; i < days; i++) {
      const day = addMinutes(rangeStart, i * 24 * 60);

      const yyyy = day.getFullYear();
      const mm = String(day.getMonth() + 1).padStart(2, "0");
      const dd = String(day.getDate()).padStart(2, "0");
      const dateKey = `${yyyy}-${mm}-${dd}`;

      const allSlots = buildSlotsForDay(day, { startHour, endHour, stepMinutes, durationMinutes });

      const anaAvail = filterBusy(allSlots, anaBusy);
      const glendaAvail = filterBusy(allSlots, glendaBusy);

      out.days.push({
        date: dateKey,
        ana: anaAvail.map(s => ({
          label: hhmm(s.start),
          startISO: s.start.toISOString(),
          endISO: s.end.toISOString(),
        })),
        glenda: glendaAvail.map(s => ({
          label: hhmm(s.start),
          startISO: s.start.toISOString(),
          endISO: s.end.toISOString(),
        })),
      });
    }

    return res.status(200).json(out);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: "Erro ao buscar agenda", detail: e?.message || String(e) });
  }
}
