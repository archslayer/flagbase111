// Spec guard to prevent mock data in production
import { NextRequest } from "next/server";

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Mock data patterns that should be blocked in production
const MOCK_PATTERNS = [
  /mock/i,
  /demo/i,
  /test/i,
  /fake/i,
  /dummy/i,
  /sample/i,
  /placeholder/i,
  /0x123/i,
  /example\.com/i,
  /localhost/i,
  /127\.0\.0\.1/i
];

// Endpoints that should not use mock data in production
const PROTECTED_ENDPOINTS = [
  '/api/trades',
  '/api/attacks',
  '/api/referrals',
  '/api/achievements',
  '/api/free-attack'
];

export function isMockData(data: any): boolean {
  if (!data) return false;
  
  const dataString = JSON.stringify(data).toLowerCase();
  
  return MOCK_PATTERNS.some(pattern => pattern.test(dataString));
}

export function shouldBlockMockData(request: NextRequest): boolean {
  if (!isProduction) return false;
  
  const pathname = request.nextUrl.pathname;
  return PROTECTED_ENDPOINTS.some(endpoint => pathname.startsWith(endpoint));
}

export function createMockDataBlockedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: 'Mock data not allowed in production',
      message: 'This endpoint is not available in production mode'
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'X-Error-Type': 'mock-data-blocked'
      }
    }
  );
}

export function validateProductionData(data: any, context: string = 'unknown'): boolean {
  if (!isProduction) return true;
  
  if (isMockData(data)) {
    console.error(`[SPEC_GUARD] Mock data detected in ${context}:`, data);
    return false;
  }
  
  return true;
}

// Middleware to check for mock data
export function specGuardMiddleware(request: NextRequest): Response | null {
  if (shouldBlockMockData(request)) {
    // Check if request body contains mock data
    if (request.method === 'POST' || request.method === 'PUT') {
      // This would need to be implemented with request body parsing
      // For now, we'll just check the URL
      const url = request.url.toLowerCase();
      if (MOCK_PATTERNS.some(pattern => pattern.test(url))) {
        return createMockDataBlockedResponse();
      }
    }
  }
  
  return null;
}

// Helper to log spec guard violations
export function logSpecViolation(violation: string, data?: any): void {
  console.error(`[SPEC_GUARD_VIOLATION] ${violation}`, data);
  
  // In production, you might want to send this to a monitoring service
  if (isProduction) {
    // Send to monitoring service
    // monitoringService.reportViolation(violation, data);
  }
}
