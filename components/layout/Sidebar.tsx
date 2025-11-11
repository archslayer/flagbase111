"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar({ className = "" }: { className?: string }) {
  const pathname = usePathname();

  const menuItems = [
    { href: '/market', label: 'Market', emoji: '🏪', description: 'Buy & sell country tokens' },
    { href: '/attack', label: 'Attack', emoji: '⚔️', description: 'Launch strategic attacks' },
    { href: '/quests', label: 'Quests', emoji: '🎯', description: 'Complete daily challenges' },
    { href: '/invite', label: 'Invite', emoji: '🎁', description: 'Refer friends & earn rewards' },
    { href: '/achievements', label: 'Achievements', emoji: '🏆', description: 'Unlock badges & rewards' },
    { href: '/profile', label: 'Profile', emoji: '👤', description: 'View your stats & settings' }
  ];

  return (
    <aside className={`sidebar ${className}`}>
      <div className="sidebar-menu">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`menu-item ${isActive ? 'active' : ''}`}
            >
              <div className="menu-item-content">
                <div className="menu-icon">
                  <span style={{fontSize: '20px'}}>{item.emoji}</span>
                </div>
                <div className="menu-text">
                  <div className="menu-label">{item.label}</div>
                  <div className="menu-description">{item.description}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
