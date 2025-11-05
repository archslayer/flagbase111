import { NextResponse } from "next/server";
import { createIdempotentHandler } from "@/lib/idempotency";

// Mock free attack usage - replace with real database logic
async function handleUseFreeAttack(request: Request) {
  try {
    const body = await request.json();
    const { userAddress, countryId } = body;

    if (!userAddress || !countryId) {
      return NextResponse.json(
        { error: "Missing user address or country ID" },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { error: "Invalid address format" },
        { status: 400 }
      );
    }

    // Check if user has remaining free attacks
    const freeAttackData = await getFreeAttackData(userAddress);
    
    if (freeAttackData.remaining <= 0) {
      return NextResponse.json(
        { error: "No remaining free attacks" },
        { status: 400 }
      );
    }

    // Validate country ID
    if (countryId < 1 || countryId > 35) {
      return NextResponse.json(
        { error: "Invalid country ID" },
        { status: 400 }
      );
    }

    // Use free attack
    const result = await useFreeAttack(userAddress, countryId);

    return NextResponse.json({
      success: true,
      remaining: result.remaining,
      txHash: result.txHash,
      message: "Free attack used successfully"
    });
  } catch (error) {
    console.error("Use free attack error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Mock functions - replace with real database calls
async function getFreeAttackData(userAddress: string): Promise<{
  remaining: number;
  totalLimit: number;
  used: number;
}> {
  // Mock: Return free attack data
  return {
    remaining: 2,
    totalLimit: 2,
    used: 0
  };
}

async function useFreeAttack(userAddress: string, countryId: number): Promise<{
  remaining: number;
  txHash: string;
}> {
  // Mock: Use free attack
  const txHash = '0x' + Math.random().toString(16).substr(2, 40);
  console.log(`Free attack used by ${userAddress} on country ${countryId}: ${txHash}`);
  
  return {
    remaining: 1, // Decreased by 1
    txHash
  };
}

// Export idempotent handler
export const POST = createIdempotentHandler(handleUseFreeAttack);
