const jwt = require('jsonwebtoken');
const AppError = require('../core/AppError');
const { authCookieName } = require('../utils/authCookies');
const userRepository = require('../repositories/userRepository');

// Regular-user authentication works only through the httpOnly session
// cookie. An Authorization: Bearer header is ignored (it used to be accepted
// here, but nothing sent it and the CSRF checks only know about the
// cookie). Shared by authenticateToken and optionalAuth.
function extractToken(req) {
    return req.cookies?.[authCookieName()] || null;
}

function verifyJwt(token) {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

function decodedUserId(decoded) {
    return decoded.userId || decoded.id;
}

// Returns the account behind a decoded token only when the token's own
// tokenVersion claim still matches the account's current one and the
// account isn't banned (docs/AUDIT.md Phase 4, item 10); otherwise null. A
// token signed before this field existed carries no tokenVersion claim at
// all; treated as 0 to match a fresh user's default, so deploying this
// doesn't force every existing session to re-login. A deleted user or a
// malformed id just means "this session is no longer valid" (null); any
// other failure (e.g. the database being down) is re-thrown for the error
// handler instead of being silently reported as a logged-out session.
async function findValidSessionAccount(decoded) {
    let user;
    try {
        user = await userRepository.findAuthFields(decodedUserId(decoded));
    } catch (error) {
        if (error.name === 'CastError') return null;
        throw error;
    }
    if (!user || user.banned) return null;
    return (decoded.tokenVersion || 0) === (user.tokenVersion || 0) ? user : null;
}

async function isSessionStillValid(decoded) {
    return Boolean(await findValidSessionAccount(decoded));
}

// Resolves the request's regular-user session exactly once and memoizes the
// result on the request, so however many auth middlewares a request passes
// through (the global optionalAuthenticate on /api, then a route's
// authenticateToken), it performs at most one user lookup. Resolves to
// { user, failure }: `user` is the decoded JWT for a valid session, else
// null with `failure` one of 'missing' | 'invalid' | 'revoked'.
// Database errors reject, for the error handler.
function resolveSession(req) {
    if (!req.sessionCheck) {
        req.sessionCheck = (async () => {
            const token = extractToken(req);
            if (!token) return { user: null, failure: 'missing' };

            let decoded;
            try {
                decoded = verifyJwt(token);
            } catch {
                return { user: null, failure: 'invalid' };
            }

            const valid = await isSessionStillValid(decoded);
            return valid ? { user: decoded, failure: null } : { user: null, failure: 'revoked' };
        })();
    }
    return req.sessionCheck;
}

const FAILURE_MESSAGES = {
    missing: 'Authentication required.',
    invalid: 'Invalid or expired session.',
    revoked: 'Session expired, please log in again.',
};

const authenticate = async (req, res, next) => {
    let session;
    try {
        session = await resolveSession(req);
    } catch (error) {
        return next(error);
    }

    if (!session.user) {
        return next(new AppError(FAILURE_MESSAGES[session.failure], 401));
    }

    req.user = session.user;
    next();
};

module.exports = authenticate;
module.exports.extractToken = extractToken;
module.exports.verifyJwt = verifyJwt;
module.exports.isSessionStillValid = isSessionStillValid;
module.exports.resolveSession = resolveSession;
module.exports.findValidSessionAccount = findValidSessionAccount;
