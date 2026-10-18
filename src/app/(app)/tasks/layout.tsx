import type { ReactNode } from "react";

export const metadata = { title: "To-dos" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
