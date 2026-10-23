import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SiteSuri",
    template: "SiteSuri | %s",
  },
  description:
    "Explore business-location suitability with geographic context, explainable scoring, and experimental activity scenarios. Built for Filipino MSMEs.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body className="font-sans antialiased">
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
