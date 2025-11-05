import { NextRequest } from "next/server";
import { requireAdmin, createAdminResponse } from "@/lib/adminAuth";
import { setMaintenanceMode, getMaintenanceMode } from "@/lib/maintenanceMode";

// Get maintenance mode status
export async function GET(request: NextRequest) {
  const { isAdmin } = requireAdmin(request);
  
  if (!isAdmin) {
    return createAdminResponse("Admin access required");
  }

  const maintenance = getMaintenanceMode();
  return new Response(JSON.stringify(maintenance), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Set maintenance mode
export async function POST(request: NextRequest) {
  const { isAdmin } = requireAdmin(request);
  
  if (!isAdmin) {
    return createAdminResponse("Admin access required");
  }

  try {
    const body = await request.json();
    const { enabled, message } = body;

    if (typeof enabled !== 'boolean') {
      return new Response(
        JSON.stringify({ error: "Invalid enabled value" }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    setMaintenanceMode(enabled, message);

    return new Response(JSON.stringify({
      success: true,
      maintenance: getMaintenanceMode()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
