/**
 * Origines autorisées à appeler les fonctions HTTP.
 * Quantique : plus de domaines Trendl codés en dur ; liste donnée par le
 * paramètre ALLOWED_ORIGINS (séparées par des virgules), + localhost en dev.
 */
const ALLOWED_ORIGINS = [
  ...String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  "http://localhost:3000",
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.set("Access-Control-Allow-Origin", origin);
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Max-Age", "3600");
}

module.exports = {ALLOWED_ORIGINS, setCors};
