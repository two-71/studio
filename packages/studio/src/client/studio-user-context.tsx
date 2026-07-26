"use client";

// Client-side access to the signed-in user (the serializable data
// that crosses the server/client boundary alongside StudioClientConfig).
// Provided once by <Studio> and read via useStudioUser() wherever it's
// needed (today: the header's avatar/name/email), avoiding prop drilling
// through the host's own shell layout.

import { createContext, useContext } from "react";

export interface StudioUser {
  name: string;
  email: string;
  image?: string | null;
}

const StudioUserContext = createContext<StudioUser | null>(null);

export function StudioUserProvider({
  user,
  children,
}: {
  user: StudioUser;
  children: React.ReactNode;
}) {
  return (
    <StudioUserContext.Provider value={user}>
      {children}
    </StudioUserContext.Provider>
  );
}

export function useStudioUser(): StudioUser {
  const user = useContext(StudioUserContext);
  if (!user) {
    throw new Error("useStudioUser() called outside <Studio>");
  }
  return user;
}
