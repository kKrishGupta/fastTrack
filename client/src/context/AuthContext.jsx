import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authService.me,
    retry: false,
  });

  const clearProtectedState = () => {
    queryClient.setQueryData(['auth', 'me'], null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  };

  useEffect(() => {
    const handleUnauthorized = () => clearProtectedState();
    window.addEventListener('facetrack:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('facetrack:unauthorized', handleUnauthorized);
  }, [queryClient]);

  const value = useMemo(() => ({
    user: session.data ?? null,
    isLoading: session.isLoading,
    isAuthenticated: Boolean(session.data),
    setUser: (user) => queryClient.setQueryData(['auth', 'me'], user),
    logout: async () => {
      await queryClient.cancelQueries();
      clearProtectedState();
      try {
        await authService.logout();
      } finally {
        clearProtectedState();
      }
    },
  }), [queryClient, session.data, session.isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
