import crypto from "crypto";
import { AUTH_TOKEN } from "./config.js";

/**
 * Express middleware — validates Bearer token from the Authorization header.
 * If AUTH_TOKEN is not configured, all requests are allowed (open access).
 */
export function bearerAuth(req, res, next) {
  if (!AUTH_TOKEN) return next();

  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    token = header.slice(7);
  } else if (req.query.token) {
    token = req.query.token;
  } else {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }
  const tokenBuf    = Buffer.from(token);
  const expectedBuf = Buffer.from(AUTH_TOKEN);

  if (tokenBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return res.status(403).json({ error: "Invalid bearer token" });
  }

  next();
}
