import React, { createContext, useContext } from 'react';
import { useNewReleaseFeedController } from '../hooks/useNewReleaseFeedController';
import type { NewReleaseListItem, NewReleaseFeedContextValue } from '../hooks/useNewReleaseFeedController';

export type { NewReleaseListItem, NewReleaseFeedContextValue };

const NewReleaseFeedContext = createContext<NewReleaseFeedContextValue | null>(null);

export const NewReleaseFeedProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useNewReleaseFeedController();

  return (
    <NewReleaseFeedContext.Provider value={value}>
      {children}
    </NewReleaseFeedContext.Provider>
  );
};

export const useNewReleaseFeed = () => {
  const context = useContext(NewReleaseFeedContext);
  if (!context) {
    throw new Error('useNewReleaseFeed must be used within a NewReleaseFeedProvider');
  }
  return context;
};
