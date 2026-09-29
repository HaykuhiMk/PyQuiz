const { extractToken, verifyJwt, isSessionStillValid } = require('./authenticateToken');

// Like authenticateToken, but never rejects: routes that allow guests (quiz
// sessions) use this so a missing, invalid, or since-invalidated token just
// means "play as a guest" instead of a 401.
async function optionalAuthenticate(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();

  let decoded;
  try {
    decoded = verifyJwt(token);
  } catch {
    // Invalid/expired token on a guest-allowed route: proceed as a guest
    // rather than failing the request.
    return next();
  }

  try {
    if (await isSessionStillValid(decoded)) {
      req.user = decoded;
    }
  } catch (error) {
    return next(error);
  }
  next();
}

module.exports = optionalAuthenticate;
