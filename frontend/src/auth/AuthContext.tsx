import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { apiRequest } from '../api/client'

import {
  getToken,
  removeToken,
  setToken,
} from './authStorage'

import {
  AuthContext,
  type RegistrationRole,
  type User,
} from './auth-context'

interface LoginResponse {
  success: boolean
  message: string
  data: {
    id: number
    name: string
    email: string
    roles: string[]
    educatorApprovalStatus: User['educatorApprovalStatus']
    token: string
  }
}

interface RegistrationResponse {
  success: boolean
  message: string
  data: User
}

interface MeResponse {
  success: boolean
  data: User
}

export function AuthProvider({
  children,
}: {
  children: ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)

  const [isLoading, setIsLoading] = useState(() =>
    Boolean(getToken()),
  )

  useEffect(() => {
    const token = getToken()

    if (!token) {
      return
    }

    const loadCurrentUser = async () => {
      try {
        const response = await apiRequest<MeResponse>(
          '/users/me',
        )

        setUser(response.data)
      } catch {
        removeToken()
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadCurrentUser()
  }, [])

  const login = async (
    email: string,
    password: string,
  ): Promise<User> => {
    const response = await apiRequest<LoginResponse>(
      '/users/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
        }),
      },
    )

    setToken(response.data.token)
    const authenticatedUser: User = {
      id: response.data.id,
      name: response.data.name,
      email: response.data.email,
      roles: response.data.roles,
      educatorApprovalStatus: response.data.educatorApprovalStatus,
    }
    setUser(authenticatedUser)
    return authenticatedUser
  }

  const register = async (
    name: string,
    email: string,
    password: string,
    role: RegistrationRole,
  ): Promise<void> => {
    await apiRequest<RegistrationResponse>('/users', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
    })
  }

  const logout = () => {
    removeToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: user !== null,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
