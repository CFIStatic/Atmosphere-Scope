import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const display = Inter({ subsets: ["latin"], variable: "--font-display" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Atmosphere Scope",
  description: "Atmosphere Scope writes its own residential estimate from a walkthrough, a line-item catalog, and recorded prices.",
  manifest: "/manifest.webmanifest",
  applicationName: "Atmosphere Scope",
  appleWebApp: { capable: true, title: "Atmosphere Scope", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#F4F1EB",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const themeBoot = `(function(){try{var t=localStorage.getItem("atmosphere.theme");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);document.documentElement.setAttribute("data-theme-preference",t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
