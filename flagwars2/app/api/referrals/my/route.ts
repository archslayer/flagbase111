import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    ok:true,
    referralCode:"demo",
    referralLink:"https://flagwars.example/invite/demo",
    invitedCount:0,
    claimableTotal:"0",
    claimedTotal:"0",
    recentInvites:[],
    recentRewards:[]
  });
}
