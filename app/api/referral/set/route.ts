import { NextResponse } from "next/server";
import { createIdempotentHandler } from "@/lib/idempotency";

// Mock referral code setting - replace with real database logic
async function handleSetReferral(request: Request) {
  try {
    const body = await request.json();
    const { referralCode, userAddress } = body;

    if (!referralCode || !userAddress) {
      return NextResponse.json(
        { error: "Missing referral code or user address" },
        { status: 400 }
      );
    }

    // Check if user is trying to refer themselves
    if (referralCode === userAddress) {
      return NextResponse.json(
        { error: "Cannot refer yourself" },
        { status: 400 }
      );
    }

    // Mock: Check if referral code already exists
    const existingReferral = await checkExistingReferral(userAddress);
    if (existingReferral) {
      return NextResponse.json(
        { 
          ok: true, 
          alreadySet: true,
          existingCode: existingReferral
        },
        { status: 200 }
      );
    }

    // Mock: Set referral code
    await setReferralCode(userAddress, referralCode);

    return NextResponse.json(
      { 
        ok: true, 
        alreadySet: false,
        referralCode: referralCode
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Referral set error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Mock functions - replace with real database calls
async function checkExistingReferral(userAddress: string): Promise<string | null> {
  // Mock: Check if user already has a referral code
  return null; // For now, always return null (no existing referral)
}

async function setReferralCode(userAddress: string, referralCode: string): Promise<void> {
  // Mock: Save referral code to database
  console.log(`Setting referral code ${referralCode} for user ${userAddress}`);
}

// Export idempotent handler
export const POST = createIdempotentHandler(handleSetReferral);
