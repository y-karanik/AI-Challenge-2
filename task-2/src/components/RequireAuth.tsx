import * as React from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

/**
 * Redirects unauthenticated users to /sign-in?redirect=<current path>.
 * After successful sign-in the sign-in page reads `redirect` and routes back.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (loading || user) return;
    if (location.pathname === "/sign-in") return;
    const target = `${location.pathname}${location.searchStr ?? ""}`;
    navigate({ to: "/sign-in", search: { redirect: target } as never, replace: true });
  }, [loading, user, location.pathname, location.searchStr, navigate]);

  if (loading || !user) return <LoadingSkeleton label="Checking your session" />;
  return <>{children}</>;
}
