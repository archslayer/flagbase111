import { NextResponse } from "next/server";

// Mock free attack data - replace with real database calls
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userAddress = url.searchParams.get('address') || '0x123...';

    // Mock free attack data
    const freeAttackData = {
      success: true,
      remaining: 2,
      totalLimit: 2,
      used: 0,
      history: [
        {
          id: 1,
          countryId: 1,
          timestamp: Date.now() - 3600000, // 1 hour ago
          txHash: '0x' + Math.random().toString(16).substr(2, 40)
        }
      ]
    };

    return NextResponse.json(freeAttackData);
  } catch (error) {
    console.error("Free attack my error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
