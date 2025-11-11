// Maintenance mode management
import { NextRequest } from "next/server";

// In-memory maintenance state - replace with Redis in production
let maintenanceMode = {
  enabled: false,
  message: "System is under maintenance. Please try again later.",
  startTime: 0,
  endTime: 0
};

export function setMaintenanceMode(enabled: boolean, message?: string) {
  maintenanceMode = {
    enabled,
    message: message || maintenanceMode.message,
    startTime: enabled ? Date.now() : 0,
    endTime: enabled ? Date.now() + (24 * 60 * 60 * 1000) : 0 // 24 hours default
  };
  
  console.log(`Maintenance mode ${enabled ? 'enabled' : 'disabled'}`);
}

export function getMaintenanceMode() {
  return { ...maintenanceMode };
}

export function isMaintenanceMode(): boolean {
  return maintenanceMode.enabled;
}

export function createMaintenanceResponse() {
  return new Response(
    JSON.stringify({
      error: "Maintenance mode is active",
      message: maintenanceMode.message,
      startTime: maintenanceMode.startTime,
      endTime: maintenanceMode.endTime
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '300' // 5 minutes
      }
    }
  );
}

export function checkMaintenanceMode(request: NextRequest): Response | null {
  if (isMaintenanceMode()) {
    return createMaintenanceResponse();
  }
  return null;
}
