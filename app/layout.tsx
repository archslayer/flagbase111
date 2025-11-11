export const metadata = { title: "FlagWars" };
import "./globals.css";
import Providers from "./providers";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import Footer from "@/components/layout/Footer";
// Database initialization is handled lazily in API routes

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Providers>
          <Header />
          <div className="main-layout" style={{ flex: 1 }}>
            <Sidebar />
            <main className="main-content">
              {children}
            </main>
          </div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
