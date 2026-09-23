// One-time migration: backfills the UserAnsweredQuestion collection from the
// legacy User.answeredQuestions array, then removes that array from every
// User document. Safe to re-run (each step is idempotent).
require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);

  const User = require('../models/user');
  const UserAnsweredQuestion = require('../models/userAnsweredQuestion');

  const users = await User.find({ answeredQuestions: { $exists: true, $ne: [] } })
    .select('_id answeredQuestions')
    .lean();

  let migratedRecords = 0;
  for (const user of users) {
    const ids = user.answeredQuestions || [];
    for (const questionId of ids) {
      await UserAnsweredQuestion.updateOne(
        { userId: user._id, questionId },
        { $setOnInsert: { userId: user._id, questionId, answeredAt: new Date() } },
        { upsert: true }
      );
      migratedRecords += 1;
    }
  }

  const unsetResult = await User.updateMany({}, { $unset: { answeredQuestions: '' } });

  console.log(
    `Migrated ${migratedRecords} answered-question records from ${users.length} user(s); ` +
      `removed the legacy field from ${unsetResult.modifiedCount} user document(s).`
  );

  await mongoose.disconnect();
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
