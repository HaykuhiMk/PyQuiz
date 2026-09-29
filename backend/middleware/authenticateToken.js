const jwt = require('jsonwebtoken');
const { authCookieName } = require('../utils/authCookies');
const userRepository = require('../repositories/userRepository');

// Shared by authenticateToken, verifyAdmin, and optionalAuth so all three
// decode a JWT and resolve its user id the same way instead of maintaining
// independent implementations.
function extractToken(req) {
    const authHeader = req.headers.authorization || "";
    const headerToken = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    return (req.cookies && req.cookies[authCookieName()]) || headerToken;
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

const authenticate = async (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({ error: "Unauthorized. No token provided." });
    }

    let decoded;
    try {
        decoded = verifyJwt(token);
    } catch (error) {
        return res.status(401).json({ error: "Unauthorized. Invalid token." });
    }

    try {
        if (!(await isSessionStillValid(decoded))) {
            return res.status(401).json({ error: "Unauthorized. Session expired, please log in again." });
        }
    } catch (error) {
        return next(error);
    }

    req.user = decoded;
    next();
};

module.exports = authenticate;
module.exports.extractToken = extractToken;
module.exports.verifyJwt = verifyJwt;
module.exports.isSessionStillValid = isSessionStillValid;
module.exports.findValidSessionAccount = findValidSessionAccount;
