module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const raw = req.query && req.query.date;
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const parsed = new Date(raw + "T00:00:00Z");
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    res.status(400).json({ error: "date must be a real calendar date" });
    return;
  }

  const upstreamUrl = "https://api-web.nhle.com/v1/score/" + raw;

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, { headers: { Accept: "application/json" } });
  } catch (_err) {
    res.status(502).json({ error: "upstream unreachable" });
    return;
  }

  if (!upstream.ok) {
    res.status(502).json({ error: "upstream error", status: upstream.status });
    return;
  }

  let body;
  try {
    body = await upstream.json();
  } catch (_err) {
    res.status(502).json({ error: "upstream returned non-json" });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=19");
  res.status(200).json(body);
};
