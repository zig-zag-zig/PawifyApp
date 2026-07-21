import React, { createContext, ReactNode, useContext } from 'react';
import { useFollowingController } from '../hooks/useFollowingController';
import type { FollowingContextValue } from '../hooks/useFollowingController';

const FollowingContext = createContext<FollowingContextValue | null>(null);

export const FollowingProvider = ({ children }: { children: ReactNode }) => {
  const value = useFollowingController();

  return (
    <FollowingContext.Provider value={value}>
      {children}
    </FollowingContext.Provider>
  );
};

export const useFollowing = () => {
  const context = useContext(FollowingContext);
  if (!context) {
    throw new Error('useFollowing must be used within a FollowingProvider');
  }
  return context;
};
