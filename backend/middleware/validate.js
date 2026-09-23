const AppError = require('../core/AppError');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const payload = req[source];
    const result = schema.safeParse(payload);

    if (!result.success) {
      return next(
        new AppError('Validation failed', 400, result.error.flatten())
      );
    }

    req[source] = result.data;
    return next();
  };
}

module.exports = validate;
