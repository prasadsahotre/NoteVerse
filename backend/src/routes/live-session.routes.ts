import { Router } from 'express'
import { Prisma } from '../generated/prisma/client.js'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'
import { requireApprovedEducator } from '../middleware/approvedEducator.middleware.js'
import { isJoinWindowOpen, parseScheduledTimestamp } from '../utils/liveSessionValidation.js'

const router = Router()
const SESSION_TYPES = ['TEST', 'DOUBT_SOLVING', 'GENERAL_LESSON'] as const
const AUDIENCE_MODES = ['ALL_ENROLLED', 'SELECTED'] as const
const MIN_DURATION_MINUTES = 5
const MAX_DURATION_MINUTES = 480

type SessionType = (typeof SESSION_TYPES)[number]
type AudienceMode = (typeof AUDIENCE_MODES)[number]
interface AudienceInput {
  mode: AudienceMode
  studentIds?: number[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePositiveId(value: unknown): number | undefined {
  const id = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(id) && id > 0 ? id : undefined
}

function parseMeetUrl(value: unknown): { url: string | null } | { error: string } {
  if (value === null) return { url: null }
  if (typeof value !== 'string' || !value.trim()) {
    return { error: 'Google Meet URL must be a non-empty HTTPS meet.google.com URL or null' }
  }
  try {
    const parsed = new URL(value.trim())
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'meet.google.com' ||
      parsed.port !== '' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname.length < 2
    ) {
      return { error: 'Google Meet URL must use HTTPS and the meet.google.com host' }
    }
    return { url: parsed.toString() }
  } catch {
    return { error: 'Google Meet URL is invalid' }
  }
}

function parseAudience(value: unknown): AudienceInput | string {
  if (!isRecord(value) || !AUDIENCE_MODES.includes(value.mode as AudienceMode)) {
    return 'Audience must use ALL_ENROLLED or SELECTED mode'
  }

  const mode = value.mode as AudienceMode
  if (mode === 'ALL_ENROLLED') {
    if (value.studentIds !== undefined) {
      return 'studentIds are only accepted for SELECTED audiences'
    }
    return { mode }
  }

  if (!Array.isArray(value.studentIds) || value.studentIds.length === 0) {
    return 'Select at least one enrolled student'
  }
  const studentIds = value.studentIds.map(parsePositiveId)
  if (studentIds.some((id) => id === undefined)) {
    return 'Every student ID must be a positive integer'
  }
  if (new Set(studentIds).size !== studentIds.length) {
    return 'Student IDs must not contain duplicates'
  }
  return { mode, studentIds: studentIds as number[] }
}

async function resolveAudienceIds(
  transaction: Prisma.TransactionClient,
  courseId: number,
  audience: AudienceInput,
): Promise<number[] | null> {
  const enrolled = await transaction.enrollment.findMany({
    where: {
      courseId,
      user: { roles: { some: { role: { name: 'STUDENT' } } } },
      ...(audience.mode === 'SELECTED'
        ? { userId: { in: audience.studentIds! } }
        : {}),
    },
    select: { userId: true },
  })
  const studentIds = enrolled.map(({ userId }) => userId)
  if (
    studentIds.length === 0 ||
    (audience.mode === 'SELECTED' && studentIds.length !== audience.studentIds!.length)
  ) {
    return null
  }
  return studentIds
}

function sendError(res: import('express').Response, status: number, message: string) {
  return res.status(status).json({ success: false, message })
}

// Educators see only sessions attached to courses they own.
router.get(
  '/educator',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const sessions = await prisma.liveSession.findMany({
        where: { course: { is: { educatorId: req.user!.userId } } },
        orderBy: { scheduledAt: 'asc' },
        include: {
          course: { select: { id: true, title: true } },
          audience: {
            orderBy: { userId: 'asc' },
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      })
      return res.json({ success: true, data: sessions })
    } catch (error) {
      console.error('Failed to fetch educator live sessions:', error)
      return sendError(res, 500, 'Failed to fetch live sessions')
    }
  },
)

router.post(
  '/',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      if (!isRecord(req.body)) return sendError(res, 400, 'Invalid session details')
      const courseId = parsePositiveId(req.body.courseId)
      if (!courseId) return sendError(res, 400, 'Course ID must be a positive integer')
      if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
        return sendError(res, 400, 'Title is required')
      }
      if (!SESSION_TYPES.includes(req.body.type as SessionType)) {
        return sendError(res, 400, 'Invalid session type')
      }
      const scheduledAt = parseScheduledTimestamp(req.body.scheduledAt)
      if (typeof scheduledAt === 'string') return sendError(res, 400, scheduledAt)
      if (scheduledAt.getTime() <= Date.now()) {
        return sendError(res, 400, 'Session must be scheduled in the future')
      }
      const durationMinutes = req.body.durationMinutes
      if (
        !Number.isInteger(durationMinutes) ||
        Number(durationMinutes) < MIN_DURATION_MINUTES ||
        Number(durationMinutes) > MAX_DURATION_MINUTES
      ) {
        return sendError(res, 400, `Duration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes`)
      }
      if (req.body.description !== undefined && req.body.description !== null && typeof req.body.description !== 'string') {
        return sendError(res, 400, 'Description must be a string or null')
      }
      const googleMeetUrl = parseMeetUrl(req.body.googleMeetUrl ?? null)
      if ('error' in googleMeetUrl) return sendError(res, 400, googleMeetUrl.error)
      const audience = parseAudience(req.body.audience)
      if (typeof audience === 'string') return sendError(res, 400, audience)

      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, educatorId: true },
      })
      if (!course) return sendError(res, 404, 'Course not found')
      if (course.educatorId !== req.user!.userId) {
        return sendError(res, 403, 'You can only manage sessions for your own courses')
      }

      const session = await prisma.$transaction(async (transaction) => {
        const studentIds = await resolveAudienceIds(transaction, courseId, audience)
        if (!studentIds) return null
        return transaction.liveSession.create({
          data: {
            courseId,
            title: req.body.title.trim(),
            description: typeof req.body.description === 'string' ? req.body.description.trim() || null : null,
            type: req.body.type as SessionType,
            scheduledAt,
            durationMinutes: Number(durationMinutes),
            googleMeetUrl: googleMeetUrl.url,
            audienceMode: audience.mode,
            audience: {
              create: studentIds.map((userId) => ({ userId })),
            },
          },
          include: {
            course: { select: { id: true, title: true } },
            audience: {
              orderBy: { userId: 'asc' },
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      if (!session) return sendError(res, 400, 'Audience must contain currently enrolled students')
      return res.status(201).json({ success: true, message: 'Live session scheduled successfully', data: session })
    } catch (error) {
      console.error('Failed to create live session:', error)
      return sendError(res, 500, 'Failed to schedule live session')
    }
  },
)

router.patch(
  '/:sessionId',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => {
    try {
      const sessionId = parsePositiveId(req.params.sessionId)
      if (!sessionId) return sendError(res, 400, 'Invalid session ID')
      if (!isRecord(req.body)) return sendError(res, 400, 'Invalid session details')
      const allowedFields = new Set(['title', 'description', 'type', 'scheduledAt', 'durationMinutes', 'googleMeetUrl', 'audience'])
      if (Object.keys(req.body).length === 0 || Object.keys(req.body).some((key) => !allowedFields.has(key))) {
        return sendError(res, 400, 'Provide valid session fields to update')
      }

      const data: Prisma.LiveSessionUpdateManyMutationInput = {}
      if ('title' in req.body) {
        if (typeof req.body.title !== 'string' || !req.body.title.trim()) return sendError(res, 400, 'Title is required')
        data.title = req.body.title.trim()
      }
      if ('description' in req.body) {
        if (req.body.description !== null && typeof req.body.description !== 'string') return sendError(res, 400, 'Description must be a string or null')
        data.description = typeof req.body.description === 'string' ? req.body.description.trim() || null : null
      }
      if ('type' in req.body) {
        if (!SESSION_TYPES.includes(req.body.type as SessionType)) return sendError(res, 400, 'Invalid session type')
        data.type = req.body.type as SessionType
      }
      if ('scheduledAt' in req.body) {
        const scheduledAt = parseScheduledTimestamp(req.body.scheduledAt)
        if (typeof scheduledAt === 'string') return sendError(res, 400, scheduledAt)
        if (scheduledAt.getTime() <= Date.now()) return sendError(res, 400, 'Session must be scheduled in the future')
        data.scheduledAt = scheduledAt
      }
      if ('durationMinutes' in req.body) {
        if (!Number.isInteger(req.body.durationMinutes) || Number(req.body.durationMinutes) < MIN_DURATION_MINUTES || Number(req.body.durationMinutes) > MAX_DURATION_MINUTES) {
          return sendError(res, 400, `Duration must be between ${MIN_DURATION_MINUTES} and ${MAX_DURATION_MINUTES} minutes`)
        }
        data.durationMinutes = Number(req.body.durationMinutes)
      }
      if ('googleMeetUrl' in req.body) {
        const googleMeetUrl = parseMeetUrl(req.body.googleMeetUrl)
        if ('error' in googleMeetUrl) return sendError(res, 400, googleMeetUrl.error)
        data.googleMeetUrl = googleMeetUrl.url
      }
      const audience = 'audience' in req.body ? parseAudience(req.body.audience) : undefined
      if (typeof audience === 'string') return sendError(res, 400, audience)

      const result = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.liveSession.findUnique({
          where: { id: sessionId },
          select: { id: true, courseId: true, status: true, course: { select: { educatorId: true } } },
        })
        if (!existing) return { kind: 'not-found' as const }
        if (existing.course.educatorId !== req.user!.userId) return { kind: 'forbidden' as const }
        if (existing.status !== 'SCHEDULED') return { kind: 'conflict' as const }

        let audienceIds: number[] | undefined
        if (audience) {
          audienceIds = await resolveAudienceIds(transaction, existing.courseId, audience) ?? undefined
          if (!audienceIds) return { kind: 'invalid-audience' as const }
          data.audienceMode = audience.mode
        }

        const updated = await transaction.liveSession.updateMany({
          where: { id: sessionId, status: 'SCHEDULED' },
          data,
        })
        if (updated.count !== 1) return { kind: 'conflict' as const }
        if (audienceIds) {
          await transaction.liveSessionAudience.deleteMany({ where: { sessionId } })
          await transaction.liveSessionAudience.createMany({ data: audienceIds.map((userId) => ({ sessionId, userId })) })
        }
        const session = await transaction.liveSession.findUnique({
          where: { id: sessionId },
          include: {
            course: { select: { id: true, title: true } },
            audience: {
              orderBy: { userId: 'asc' },
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        })
        return { kind: 'updated' as const, session }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      if (result.kind === 'not-found') return sendError(res, 404, 'Live session not found')
      if (result.kind === 'forbidden') return sendError(res, 403, 'You can only manage sessions for your own courses')
      if (result.kind === 'conflict') return sendError(res, 409, 'Only scheduled sessions can be edited')
      if (result.kind === 'invalid-audience') return sendError(res, 400, 'Audience must contain currently enrolled students')
      return res.json({ success: true, message: 'Live session updated successfully', data: result.session })
    } catch (error) {
      console.error('Failed to update live session:', error)
      return sendError(res, 500, 'Failed to update live session')
    }
  },
)

async function transitionSession(
  req: AuthRequest,
  res: import('express').Response,
  sessionIdValue: unknown,
  targetStatus: 'CANCELLED' | 'COMPLETED',
) {
  const sessionId = parsePositiveId(sessionIdValue)
  if (!sessionId) return sendError(res, 400, 'Invalid session ID')

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.liveSession.findUnique({
        where: { id: sessionId },
        select: { id: true, status: true, course: { select: { educatorId: true } } },
      })
      if (!existing) return { kind: 'not-found' as const }
      if (existing.course.educatorId !== req.user!.userId) return { kind: 'forbidden' as const }
      if (existing.status !== 'SCHEDULED') return { kind: 'conflict' as const }

      const update = await transaction.liveSession.updateMany({
        where: { id: sessionId, status: 'SCHEDULED' },
        data: { status: targetStatus, googleMeetUrl: null },
      })
      if (update.count !== 1) return { kind: 'conflict' as const }
      return {
        kind: 'updated' as const,
        session: await transaction.liveSession.findUnique({
          where: { id: sessionId },
          include: { course: { select: { id: true, title: true } } },
        }),
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    if (result.kind === 'not-found') return sendError(res, 404, 'Live session not found')
    if (result.kind === 'forbidden') return sendError(res, 403, 'You can only manage sessions for your own courses')
    if (result.kind === 'conflict') return sendError(res, 409, 'Only scheduled sessions can be cancelled or completed')
    return res.json({
      success: true,
      message: targetStatus === 'CANCELLED' ? 'Live session cancelled successfully' : 'Live session completed successfully',
      data: result.session,
    })
  } catch (error) {
    console.error(`Failed to ${targetStatus.toLowerCase()} live session:`, error)
    return sendError(res, 500, `Failed to ${targetStatus.toLowerCase()} live session`)
  }
}

router.post(
  '/:sessionId/cancel',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => transitionSession(req, res, req.params.sessionId, 'CANCELLED'),
)

router.post(
  '/:sessionId/complete',
  authenticateToken,
  requireRole('EDUCATOR'),
  requireApprovedEducator,
  async (req: AuthRequest, res) => transitionSession(req, res, req.params.sessionId, 'COMPLETED'),
)

router.get(
  '/student',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    try {
      const studentId = req.user!.userId
      const sessions = await prisma.liveSession.findMany({
        where: {
          audience: { some: { userId: studentId } },
          course: { is: { enrollments: { some: { userId: studentId } } } },
        },
        orderBy: { scheduledAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          scheduledAt: true,
          durationMinutes: true,
          googleMeetUrl: true,
          status: true,
          course: {
            select: {
              id: true,
              title: true,
              educator: { select: { id: true, name: true } },
            },
          },
        },
      })
      const now = new Date()
      const data = sessions.map(({ googleMeetUrl, ...session }) => ({
        ...session,
        joinAvailable: Boolean(
          googleMeetUrl &&
          session.status === 'SCHEDULED' &&
          isJoinWindowOpen(session.scheduledAt, session.durationMinutes, now),
        ),
      }))
      return res.json({ success: true, data })
    } catch (error) {
      console.error('Failed to fetch student live sessions:', error)
      return sendError(res, 500, 'Failed to fetch live sessions')
    }
  },
)

router.post(
  '/:sessionId/join',
  authenticateToken,
  requireRole('STUDENT'),
  async (req: AuthRequest, res) => {
    const sessionId = parsePositiveId(req.params.sessionId)
    if (!sessionId) return sendError(res, 400, 'Invalid session ID')

    try {
      const result = await prisma.$transaction(async (transaction) => {
        const session = await transaction.liveSession.findUnique({
          where: { id: sessionId },
          select: {
            id: true,
            courseId: true,
            scheduledAt: true,
            durationMinutes: true,
            googleMeetUrl: true,
            status: true,
            audience: { where: { userId: req.user!.userId }, select: { userId: true } },
          },
        })
        if (!session || session.audience.length === 0) return { kind: 'not-eligible' as const }
        const enrollment = await transaction.enrollment.findUnique({
          where: {
            userId_courseId: {
              userId: req.user!.userId,
              courseId: session.courseId,
            },
          },
          select: { id: true },
        })
        if (!enrollment) return { kind: 'not-eligible' as const }
        if (session.status !== 'SCHEDULED' || !session.googleMeetUrl) return { kind: 'closed' as const }
        if (!isJoinWindowOpen(session.scheduledAt, session.durationMinutes, new Date())) return { kind: 'outside-window' as const }
        return { kind: 'ready' as const, googleMeetUrl: session.googleMeetUrl }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

      if (result.kind === 'not-eligible') return sendError(res, 404, 'Live session not found')
      if (result.kind === 'closed') return sendError(res, 409, 'This live session is closed')
      if (result.kind === 'outside-window') return sendError(res, 409, 'This live session is outside its join window')
      return res.json({ success: true, data: { googleMeetUrl: result.googleMeetUrl } })
    } catch (error) {
      console.error('Failed to authorize live session join:', error)
      return sendError(res, 500, 'Unable to join this live session')
    }
  },
)

export default router
