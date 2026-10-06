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

export interface User {
  id: number
  name: string
  email: string
  roles: string[]
}

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

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)

export function AuthProvider({
  children,
}: {
  children: ReactNode
}) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getToken()

    if (!token) {
      setIsLoading(false)
      return
    }

    const loadCurrentUser = async () => {
      try {
        const response = await apiRequest<MeResponse>('/users/me')
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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error(
      'useAuth must be used inside an AuthProvider',
    )
  }

  return context
}