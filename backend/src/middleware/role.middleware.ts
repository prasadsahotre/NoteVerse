import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth.middleware.js'

export const requireRole = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      })
    }

    const hasRole = req.user.roles.some((role) =>
      allowedRoles.includes(role),
    )

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action',
      })
    }

    next()
  }
}