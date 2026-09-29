// Finds existing accounts whose usernames collide case-insensitively — this
// is now rejected at registration/profile-update time (docs/AUDIT.md item 9
// / Phase 3 addendum), but accounts created before that check was added may
// still collide, and the new unique index on User.usernameLower will fail
// to build while any duplicates exist.
//
// Usage:
//   node backend/scripts/reportDuplicateUsernames.js            # report only, no writes
//   node backend/scripts/reportDuplicateUsernames.js --apply    # applies the proposed renames
//
// Within each colliding group, the oldest account (by _id / creation order)
// keeps its current username; every other member is proposed a suffixed
// rename (username2, username3, ...) that doesn't collide with any existing
// or already-proposed username. Never run --apply against production
// without reviewing the report first — renamed users are not notified by
// this script.

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/user');

async function main() {
  const apply = process.argv.includes('--apply');

  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI in the environment — see backend/env.example.');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const users = await User.find({}).select('_id username').sort({ _id: 1 }).lean();

    const takenLower = new Set(users.map((u) => u.username.toLowerCase()));
    const groups = new Map();
    for (const user of users) {
      const key = user.username.toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(user);
    }

    const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
    if (!duplicateGroups.length) {
      console.log('No case-insensitive username duplicates found.');
      return;
    }

    console.log(`Found ${duplicateGroups.length} colliding username group(s):`);
    const renames = [];
    for (const group of duplicateGroups) {
      const [keep, ...rest] = group; // sorted by _id above, so oldest first
      console.log(`  "${keep.username}" (${keep._id}) keeps its username.`);
      for (const user of rest) {
        let suffix = 2;
        let candidate = `${user.username}${suffix}`;
        while (takenLower.has(candidate.toLowerCase())) {
          suffix += 1;
          candidate = `${user.username}${suffix}`;
        }
        takenLower.add(candidate.toLowerCase());
        renames.push({ userId: user._id, from: user.username, to: candidate });
        console.log(`  "${user.username}" (${user._id}) -> proposed rename: "${candidate}"`);
      }
    }

    if (!apply) {
      console.log('\n[dry-run] No changes were made. Re-run with --apply to rename.');
      return;
    }

    for (const rename of renames) {
      await User.updateOne(
        { _id: rename.userId },
        { $set: { username: rename.to, usernameLower: rename.to.toLowerCase() } }
      );
    }
    console.log(`\nApplied ${renames.length} rename(s).`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('reportDuplicateUsernames failed:', error);
  process.exit(1);
});
