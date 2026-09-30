const bcrypt = require('bcryptjs');

// Compared against when the account doesn't exist, so a login for an
// unknown email/username costs the same bcrypt work as a wrong password and
// the two can't be told apart by response time.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-account-password', 10);

// True only when the account exists and the password matches. Always runs
// exactly one bcrypt comparison, whether or not the account exists.
async function passwordMatchesAccount(password, account) {
  const isMatch = await bcrypt.compare(password, account ? account.password : DUMMY_PASSWORD_HASH);
  return Boolean(account) && isMatch;
}

module.exports = { passwordMatchesAccount };
