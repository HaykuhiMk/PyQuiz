const bcrypt = require('bcrypt');

async function hashPassword(password) {
    const saltRounds = 10; 
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
}

async function verifyPassword(password, hashedPassword) {
    const isMatch = await bcrypt.compare(password, hashedPassword);
    return isMatch;
}

module.exports = { hashPassword, verifyPassword };
