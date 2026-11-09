import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../services/firebaseAdmin.ts';

export interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    email: string;
  };
}

export async function requireOwnerAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or malformed authorization token',
    });
  }

  const idToken = authHeader.split('Bearer ')[1]?.trim();
  if (!idToken) {
    return res.status(401).json({
      error: 'Unauthorized: Empty token',
    });
  }

  const ownerEmail = (process.env.OWNER_EMAIL || 'bjarkasonsverrir@gmail.com').trim().toLowerCase();

  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userEmail = (decodedToken.email || '').trim().toLowerCase();

    if (userEmail !== ownerEmail) {
      return res.status(403).json({
        error: 'Forbidden: This account is not allowed.',
      });
    }

    req.user = {
      uid: decodedToken.uid,
      email: userEmail,
    };

    next();
  } catch (error: any) {
    // Never expose internal stack traces or secrets in error messages
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired session',
    });
  }
}
