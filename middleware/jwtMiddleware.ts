
import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { config } from "../config/env.ts";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

class AuthenticationError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.status = status;
  }
}

const resolveUser = async (
  _req: Request,
  token: string,
): Promise<AuthenticatedUser> => {
  let decoded: string | JwtPayload;

  try {
    decoded = jwt.verify(token, config.jwtAccessSecret, {
      issuer: "voice-note-api",
      audience: "voice-note-client",
    });
  } catch (error: unknown) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError("Unauthorized: Token has expired");
    }

    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError("Unauthorized: Invalid token");
    }

    throw error;
  }

  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.email !== "string"
  ) {
    throw new AuthenticationError("Unauthorized: Invalid token payload");
  }

  return {
    id: decoded.sub,
    email: decoded.email,
  };
};

const sendAuthError = (
  res: Response,
  error: unknown,
  context: string,
) => {
  if (error instanceof AuthenticationError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  console.error(`${context}:`, error);

  return res.status(500).json({
    success: false,
    message: "An unexpected authentication error occurred",
  });
};

export const middleWareProtection = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: No token provided",
    });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token || token.includes(" ")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid token",
    });
  }

  try {
    req.user = await resolveUser(req, token);
    return next();
  } catch (error: unknown) {
    return sendAuthError(res, error, "Auth verification failed");
  }
};

export const sseAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;

  const headerToken =
    authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

  const queryToken =
    typeof req.query.token === "string"
      ? req.query.token
      : null;

  // Prefer the Authorization header over the query parameter.
  const token = headerToken || queryToken;

  if (!token || token.includes(" ")) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: No valid token provided",
    });
  }

  try {
    req.user = await resolveUser(req, token);
    return next();
  } catch (error: unknown) {
    return sendAuthError(res, error, "SSE auth verification failed");
  }
};
