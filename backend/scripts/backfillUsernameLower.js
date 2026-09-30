// One-time backfill for the new User.usernameLower field (docs/AUDIT.md
// item 9 / Phase 3 addendum: case-insensitive username uniqueness).
// Existing accounts created before this field existed won't have it set;
// the field's index is `sparse` so it tolerates that, but every account
// should still get it populated so uniqueness is actually enforced across
// the whole user base, not just new/recently-saved accounts.
//
// Safe to run any time, including repeatedly (only touches documents where
// usernameLower is missing) and before or after
// reportDuplicateUsernames.js. Recommended order for an existing database:
//   1. node backend/scripts/backfillUsernameLower.js
//   2. node backend/scripts/reportDuplicateUsernames.js   (review the report)
//   3. node backend/scripts/reportDuplicateUsernames.js --apply   (if needed)
//
// Usage:
//   node backend/scripts/backfillUsernameLower.js            # report only, no writes
//   node backend/scripts/backfillUsernameLower.js --apply    # applies the backfill

require('dotenv').config();
const mongoose = require('mongoose');
const { resolveMongoUri, MISSING_MONGO_URI_MESSAGE } = require('../config/mongoUri');
const User = require('../models/user');

async function main() {
  const apply = process.argv.includes('--apply');

  const mongoUri = resolveMongoUri();
  if (!mongoUri) {
    console.error(MISSING_MONGO_URI_MESSAGE);
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(mongoUri);

  try {
    const missing = await User.find({
      $or: [{ usernameLower: { $exists: false } }, { usernameLower: null }],
    })
      .select('_id username')
      .lean();

    if (!missing.length) {
      console.log('Every user already has usernameLower set — nothing to backfill.');
      return;
    }

    console.log(`${missing.length} user(s) missing usernameLower.`);
    if (!apply) {
      console.log('[dry-run] No changes were made. Re-run with --apply to backfill.');
      return;
    }

    for (const user of missing) {
      await User.updateOne({ _id: user._id }, { $set: { usernameLower: user.username.toLowerCase() } });
    }
    console.log(`Backfilled usernameLower for ${missing.length} user(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('backfillUsernameLower failed:', error);
  process.exit(1);
});
