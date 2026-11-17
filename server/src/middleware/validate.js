import { ApiError } from '../utils/api-error.js';

export const validate = (schema, property = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[property]);
  if (!result.success) {
    return next(
      new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed', result.error.flatten()),
    );
  }
  req.validated ??= {};
  req.validated[property] = result.data;
  return next();
};
