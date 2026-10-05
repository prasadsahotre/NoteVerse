import { Router } from 'express'
import prisma from '../lib/prisma.js'
import {
  authenticateToken,
  AuthRequest,
} from '../middleware/auth.middleware.js'
import { requireRole } from '../middleware/role.middleware.js'

const router = Router()

router.get(
  '/educator',
  authenticateToken,
  requireRole('EDUCATOR'),
  async (req: AuthRequest, res) => {
    try {
      const educatorId = req.user!.userId

      const courses = await prisma.course.findMany({
        where: {
          educatorId,
        },
        include: {
          enrollments: {
            select: {
              userId: true,
            },
          },
          modules: {
            include: {
              lessons: {
                select: {
                  id: true,
                  quizzes: {
                    select: {
                      id: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      const totalCourses = courses.length

      const publishedCourses = courses.filter(
        (course) => course.status === 'PUBLISHED',
      ).length

      const totalEnrollments = courses.reduce(
        (total, course) => total + course.enrollments.length,
        0,
      )

      const uniqueStudentIds = new Set<number>()

      courses.forEach((course) => {
        course.enrollments.forEach((enrollment) => {
          uniqueStudentIds.add(enrollment.userId)
        })
      })

      // Recent enrollments
      const courseIds = courses.map((course) => course.id)

      const recentEnrollments =
        courseIds.length > 0
          ? await prisma.enrollment.findMany({
              where: {
                courseId: {
                  in: courseIds,
                },
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
                course: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
              take: 10,
            })
          : []

      const courseAnalytics = await Promise.all(
        courses.map(async (course) => {
          const lessonIds = course.modules.flatMap((module) =>
            module.lessons.map((lesson) => lesson.id),
          )

          const enrolledStudentIds = course.enrollments.map(
            (enrollment) => enrollment.userId,
          )

          let completedStudents = 0

          if (lessonIds.length > 0 && enrolledStudentIds.length > 0) {
            const progressRecords =
              await prisma.lessonProgress.findMany({
                where: {
                  userId: {
                    in: enrolledStudentIds,
                  },
                  lessonId: {
                    in: lessonIds,
                  },
                  completed: true,
                },
                select: {
                  userId: true,
                  lessonId: true,
                },
              })

            const completedLessonsByStudent = new Map<
              number,
              Set<number>
            >()

            progressRecords.forEach((progress) => {
              if (!completedLessonsByStudent.has(progress.userId)) {
                completedLessonsByStudent.set(
                  progress.userId,
                  new Set<number>(),
                )
              }

              completedLessonsByStudent
                .get(progress.userId)!
                .add(progress.lessonId)
            })

            completedStudents = enrolledStudentIds.filter(
              (studentId) =>
                completedLessonsByStudent.get(studentId)?.size ===
                lessonIds.length,
            ).length
          }

          const enrollmentCount = course.enrollments.length

          const quizIds = course.modules.flatMap((module) =>
            module.lessons.flatMap((lesson) =>
              lesson.quizzes.map((quiz) => quiz.id),
            ),
          )

          let quizAttempts = 0
          let averageQuizScore = 0

          if (quizIds.length > 0) {
            const attempts = await prisma.quizAttempt.findMany({
              where: {
                quizId: {
                  in: quizIds,
                },
              },
              select: {
                score: true,
              },
            })

            quizAttempts = attempts.length

            if (attempts.length > 0) {
              const totalScore = attempts.reduce(
                (total, attempt) => total + attempt.score,
                0,
              )

              averageQuizScore = Math.round(
                totalScore / attempts.length,
              )
            }
          }

          // Course ratings
          const reviews = await prisma.courseReview.findMany({
            where: {
              courseId: course.id,
            },
            select: {
              rating: true,
            },
          })

          const reviewCount = reviews.length

          const averageRating =
            reviewCount === 0
              ? 0
              : Math.round(
                  (reviews.reduce(
                    (total, review) => total + review.rating,
                    0,
                  ) /
                    reviewCount) *
                    10,
                ) / 10

          const completionRate =
            enrollmentCount === 0
              ? 0
              : Math.round(
                  (completedStudents / enrollmentCount) * 100,
                )

          return {
            courseId: course.id,
            title: course.title,
            status: course.status,
            enrollments: enrollmentCount,
            completedStudents,
            completionRate,
            quizAttempts,
            averageQuizScore,
            averageRating,
            reviewCount,
          }
        }),
      )

      const totalCompletedStudents = courseAnalytics.reduce(
        (total, course) => total + course.completedStudents,
        0,
      )

      const overallCompletionRate =
        totalEnrollments === 0
          ? 0
          : Math.round(
              (totalCompletedStudents / totalEnrollments) * 100,
            )

      return res.json({
        success: true,
        data: {
          totalCourses,
          publishedCourses,
          totalEnrollments,
          totalStudents: uniqueStudentIds.size,
          overallCompletionRate,
          courses: courseAnalytics,
          recentEnrollments: recentEnrollments.map(
            (enrollment) => ({
              studentId: enrollment.user.id,
              studentName: enrollment.user.name,
              courseId: enrollment.course.id,
              courseTitle: enrollment.course.title,
              enrolledAt: enrollment.createdAt,
            }),
          ),
        },
      })
    } catch (error) {
      console.error('Educator analytics error:', error)

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch educator analytics',
      })
    }
  },
)

export default router