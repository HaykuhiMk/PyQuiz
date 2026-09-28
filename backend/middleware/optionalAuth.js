const { extractToken, verifyJwt } = require('./authenticateToken');

// Like authenticateToken, but never rejects: routes that allow guests (quiz
// sessions) use this so a missing or invalid token just means "play as a
// guest" instead of a 401.
function optionalAuthenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  try {
    req.user = verifyJwt(token);
  } catch {
    // Invalid/expired token on a guest-allowed route: proceed as a guest
    // rather than failing the request.
  }
  next();
}

module.exports = optionalAuthenticate;
