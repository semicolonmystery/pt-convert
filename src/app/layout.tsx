import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "Packet Tracer Converter";
const SITE_DESCRIPTION =
  "Convert Cisco Packet Tracer .pkt and .pka files to readable XML or LLM-friendly JSON in your browser. Encrypt XML back to .pkt. Free, client-side, no upload.";

export const metadata: Metadata = {
  metadataBase: new URL("https://pt-convert.podik.cz"),
  title: {
    default: `${SITE_NAME} — Convert PKT, PKA & XML Online`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: "Semicolon Mystery" }],
  creator: "Semicolon Mystery",
  category: "developer-tools",
  keywords: [
    "packet tracer converter",
    "convert pkt online",
    "pkt to xml",
    "pkt to json",
    "pka to json",
    "pka to xml",
    "decrypt packet tracer file",
    "encrypt pkt file",
    "cisco packet tracer extractor",
    "pkt file viewer",
    "packet tracer xml decoder",
    "open pkt online",
    "packet tracer to json",
    "packet tracer file converter",
    "free packet tracer tool",
  ],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Convert PKT, PKA & XML Online`,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Convert PKT, PKA & XML Online`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any (browser-based)",
  browserRequirements: "Requires a modern browser with JavaScript enabled.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Decrypt .pkt files to native XML",
    "Decrypt .pkt and .pka files to LLM-friendly JSON",
    "Encrypt XML back into the Packet Tracer .pkt container",
    "Fully client-side — no upload, no server",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-mono",
        jetbrainsMono.variable,
      )}
    >
      <head>
        <meta
          property="og:logo"
          content="https://pt-convert.podik.cz/icon.svg"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster richColors />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
