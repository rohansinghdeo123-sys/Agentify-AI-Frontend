import { AuthProvider } from "@/context/AuthContext";
import { Manrope } from "next/font/google";
import "./globals.css";

const appFont = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-agentify",
});

export const metadata = {
  title: "AgentifyAI",
  description: "Personal AI Agent - your own AI coach, trained on your progress.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AgentifyAI",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F5" },
    { media: "(prefers-color-scheme: dark)", color: "#07101C" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('agentify-theme') || 'light';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${appFont.variable} flex min-h-screen flex-col antialiased`}>
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[200] -translate-y-24 rounded-lg bg-[#0E6878] px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition focus:translate-y-0"
        >
          Skip to main content
        </a>
        {/* Keep the streamed server shell stable while authentication restores. */}
        <div className="min-h-0 w-full flex-1">
          <AuthProvider>
            {children}
          </AuthProvider>
        </div>
      </body>
    </html>
  );
}
