import { NextRequest } from "next/server";
import { requireAdmin, createAdminResponse } from "@/lib/adminAuth";
import { cleanupExpiredIdempotencyKeys, getIndexStatistics, forceCleanupStuckKeys } from "@/lib/idempotency-cleanup";

// Get cleanup statistics
export async function GET(request: NextRequest) {
  const { isAdmin } = requireAdmin(request);
  
  if (!isAdmin) {
    return createAdminResponse("Admin access required");
  }

  try {
    const stats = await getIndexStatistics();
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Run cleanup
export async function POST(request: NextRequest) {
  const { isAdmin } = requireAdmin(request);
  
  if (!isAdmin) {
    return createAdminResponse("Admin access required");
  }

  try {
    const body = await request.json();
    const { force } = body;

    let result;
    
    if (force) {
      result = await forceCleanupStuckKeys();
    } else {
      result = await cleanupExpiredIdempotencyKeys();
    }

    return new Response(JSON.stringify({
      success: true,
      result
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
