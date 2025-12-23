import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "LegatePro — Modern Probate Management",
  description: "AI-powered probate management platform for personal representatives.",
  icons: {
    icon: "/logo-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <body
        className={
          [
            GeistSans.variable,
            GeistMono.variable,
            // Global baseline
            "min-h-screen bg-slate-950 text-slate-50 antialiased",
            // Typography rhythm
            "leading-6 tracking-[-0.012em]",
            // Better text rendering + selection
            "[text-rendering:optimizeLegibility] selection:bg-slate-200/20 selection:text-slate-50",
            // Accessible focus styles
            "focus:outline-none",
            "[&_*]:focus-visible:outline-none [&_*]:focus-visible:ring-2 [&_*]:focus-visible:ring-slate-200/60 [&_*]:focus-visible:ring-offset-2 [&_*]:focus-visible:ring-offset-slate-950",
          ].join(" ")
        }
      >
        <div id="app" className="min-h-screen">
          {/*
            Default app container rhythm.
            Pages that need full-width layouts can set `data-fullbleed` on their top-level wrapper.
          */}
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <main className="min-h-[calc(100vh-3rem)]" data-app-main>
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
