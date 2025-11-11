"use client";
import { ConnectAndLogin } from "@/components/ConnectAndLogin";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Header() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <header style={{
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--stroke)',
      padding: isMobile ? '0.75rem 1rem' : '1rem 2rem'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <Link 
          href="/" 
          style={{
            fontSize: isMobile ? '1.25rem' : '1.5rem',
            fontWeight: 'bold',
            textDecoration: 'none',
            color: 'var(--gold)',
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '0.5rem' : '0.75rem'
          }}
        >
          <img 
            src="/flagwarsweblogo.png" 
            alt="FlagWars Logo" 
            style={{
              height: isMobile ? '32px' : '40px',
              width: 'auto',
              objectFit: 'contain'
            }}
          />
        </Link>
        <ConnectAndLogin />
      </div>
    </header>
  );
}