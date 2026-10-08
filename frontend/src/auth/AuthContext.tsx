import {
  createContext,
  useContext,
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
  type User,
} from './auth-context'

interface LoginResponse {
  success: boolean
  message: string
  data: {
    token: string
    user: User
  }
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
  ): Promise<void> => {
    const response = await apiRequest<LoginResponse>('/users/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    })

    setToken(response.data.token)
    setUser(response.data.user)
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
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}