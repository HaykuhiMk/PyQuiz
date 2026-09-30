const { resolveSession } = require('./authenticateToken');

// Like authenticateToken, but never rejects: a missing, invalid or
// since-invalidated session just means "guest". Mounted once, globally on
// /api (app.js), before the rate limiters, so req.user is known when their
// keys are computed; guest-capable routes (quiz sessions, the leaderboard)
// rely on that and don't mount it again. The session is resolved once per
// request and shared with authenticateToken (resolveSession).
async function optionalAuthenticate(req, res, next) {
  try {
    const session = await resolveSession(req);
    if (session.user) req.user = session.user;
  } catch (error) {
    return next(error);
  }
  next();
}

module.exports = optionalAuthenticate;
