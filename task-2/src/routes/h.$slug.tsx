import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/h/$slug")({
  component: () => <Outlet />,
});
