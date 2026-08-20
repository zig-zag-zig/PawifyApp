import React, { createContext, useContext } from 'react';
import { useAuthSession, type AuthSessionValue, type SkipRemotePushTokenCleanupOption } from './authSession';

export type { SkipRemotePushTokenCleanupOption } from './authSession';
export type { AuthTokenError } from './authToken';

export interface AuthContextType extends AuthSessionValue {}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useAuthSession();

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
