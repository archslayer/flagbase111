// Admin authentication and authorization
import { NextRequest } from "next/server";
import { getAddress } from 'viem'

// Admin password (should be in env in production)
const ADMIN_PASSWORD = '123789Fw.'

// Admin wallet address (only this wallet can access admin panel)
const ADMIN_WALLET = '0xc32e33f743cf7f95d90d1392771632ff1640de16'

export function isAdminAddress(address: string): boolean {
  if (!address) return false;
  
  const normalizedAddress = address.toLowerCase();
  return normalizedAddress === ADMIN_WALLET.toLowerCase();
}

export function verifyAdminPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

export function requireAdmin(request: NextRequest): { isAdmin: boolean; address?: string; error?: string } {
  // Get address from JWT or request
  const address = request.headers.get('x-user-address') || 
                 request.nextUrl.searchParams.get('address') || 
                 null;
  
  if (!address) {
    return { isAdmin: false, error: 'No wallet address provided' };
  }
  
  const checksummed = getAddress(address);
  const isAdmin = isAdminAddress(checksummed);
  
  return {
    isAdmin,
    address: checksummed,
    error: isAdmin ? undefined : 'Unauthorized wallet address'
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
