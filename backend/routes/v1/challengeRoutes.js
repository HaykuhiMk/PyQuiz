const express = require('express');
const challengeController = require('../../controllers/challengeController');
const authenticateToken = require('../../middleware/authenticateToken');
const verifyCsrf = require('../../middleware/csrf');
const validate = require('../../middleware/validate');
const { z } = require('zod');

const router = express.Router();

const submitDailySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedIndex: z.number().int().min(0),
      })
    )
    .min(1),
});

router.get('/daily', authenticateToken, challengeController.getDaily);
router.post(
  '/daily/submit',
  authenticateToken,
  verifyCsrf,
  validate(submitDailySchema),
  challengeController.submitDaily
);

module.exports = router;
