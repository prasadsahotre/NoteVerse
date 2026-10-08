import { createBrowserRouter } from 'react-router-dom'
import HomePage from '../pages/HomePage'
import NotFoundPage from '../pages/NotFoundPage'
import StudentDashboard from '../pages/StudentDashboard'
import EducatorDashboard from '../pages/EducatorDashboard'
import AdminDashboard from '../pages/AdminDashboard'
import ProtectedRoute from '../components/ProtectedRoute'
import StudentCoursePage from '../pages/StudentCoursePage'
import StudentLessonPage from '../pages/StudentLessonPage'
import StudentQuizPage from '../pages/StudentQuizPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/student',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/courses/:courseId',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentCoursePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/courses/:courseId/lessons/:lessonId',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentLessonPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/student/quizzes/:quizId',
    element: (
      <ProtectedRoute allowedRoles={['STUDENT']}>
        <StudentQuizPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/educator',
    element: (
      <ProtectedRoute allowedRoles={['EDUCATOR']}>
        <EducatorDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={['ADMIN']}>
        <AdminDashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])