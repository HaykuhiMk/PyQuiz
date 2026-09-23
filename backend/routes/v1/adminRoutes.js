const express = require('express');
const adminAuthController = require('../../controllers/adminAuthController');
const adminQuestionController = require('../../controllers/adminQuestionController');
const adminUserController = require('../../controllers/adminUserController');
const adminContactController = require('../../controllers/adminContactController');
const verifyAdmin = require('../../middleware/verifyAdmin');
const validate = require('../../middleware/validate');
const {
  adminLoginSchema,
  paginationQuerySchema,
  setBannedSchema,
} = require('../../validators/adminValidators');
const { questionFilterSchema, updateQuestionSchema } = require('../../validators/questionValidators');

const router = express.Router();

router.post('/login', validate(adminLoginSchema), adminAuthController.login);

router.get('/users', verifyAdmin, validate(paginationQuerySchema, 'query'), adminUserController.list);
router.patch(
  '/users/:id/ban',
  verifyAdmin,
  validate(setBannedSchema),
  adminUserController.setBanned
);

router.get(
  '/contacts',
  verifyAdmin,
  validate(paginationQuerySchema, 'query'),
  adminContactController.list
);

router.get(
  '/questions',
  verifyAdmin,
  validate(questionFilterSchema, 'query'),
  adminQuestionController.list
);
router.get('/questions/:id', verifyAdmin, adminQuestionController.getOne);
router.patch(
  '/questions/:id',
  verifyAdmin,
  validate(updateQuestionSchema),
  adminQuestionController.update
);
router.delete('/questions/:id', verifyAdmin, adminQuestionController.remove);

module.exports = router;
