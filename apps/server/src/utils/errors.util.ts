export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function badRequest(message: string): AppError {
  return new AppError(message, 400);
}

export function unauthorized(message: string): AppError {
  return new AppError(message, 401);
}

export function forbidden(message: string): AppError {
  return new AppError(message, 403);
}

export function notFound(message: string): AppError {
  return new AppError(message, 404);
}

export function conflict(message: string): AppError {
  return new AppError(message, 409);
}
