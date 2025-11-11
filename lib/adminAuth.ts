// Admin authentication and authorization
import { NextRequest } from "next/server";

// Mock admin addresses - replace with real admin list
const ADMIN_ADDRESSES = [
  '0xc32e33f743cf7f95d90d1392771632ff1640de16',
  '0x1234567890123456789012345678901234567890', // Mock admin
];

export function isAdminAddress(address: string): boolean {
  if (!address) return false;
  
  const normalizedAddress = address.toLowerCase();
  return ADMIN_ADDRESSES.includes(normalizedAddress);
}

export function requireAdmin(request: NextRequest): { isAdmin: boolean; address?: string } {
  // Mock: Get address from request headers or query params
  const address = request.headers.get('x-user-address') || 
                 request.nextUrl.searchParams.get('address') ||
                 '0x1234567890123456789012345678901234567890'; // Mock address for testing
  
  return {
    isAdmin: isAdminAddress(address),
    address
  };
}

export function createAdminResponse(error: string, status: number = 403) {
  return new Response(
    JSON.stringify({ error, admin: false }),
    { 
      status,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
