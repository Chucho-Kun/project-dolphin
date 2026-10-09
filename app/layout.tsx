import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project Dolphin",
  description: "Pop-up cards personalizables",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
