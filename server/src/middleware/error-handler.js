import mongoose from 'mongoose';
import { ApiError } from '../utils/api-error.js';

export function notFoundHandler(req, res, next) {
  next(new ApiError(404, 'ROUTE_NOT_FOUND', 'API route not found'));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let normalized = error;
  if (error instanceof mongoose.Error.CastError) {
    normalized = new ApiError(400, 'INVALID_IDENTIFIER', 'Invalid resource identifier');
  } else if (error?.code === 11000) {
    normalized = new ApiError(409, 'DUPLICATE_RESOURCE', 'A unique resource already exists');
  } else if (!(error instanceof ApiError)) {
    normalized = new ApiError(500, 'INTERNAL_ERROR', 'Unexpected server error');
  }

  if (normalized.status >= 500) {
    console.error({
      code: error?.code || error?.name,
      message: error?.message,
      path: req.originalUrl,
    });
  }

  const body = {
    error: {
      code: normalized.code,
      message: normalized.message,
    },
  };
  if (normalized.details && !req.app.get('config')?.isProduction) {
    body.error.details = normalized.details;
  }
  return res.status(normalized.status).json(body);
}
