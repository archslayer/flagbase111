import { NextResponse } from "next/server";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const countryId = Number(url.searchParams.get("countryId")||"0");
  // Sadece örnek: hiçbir WF aktif değil
  return NextResponse.json({
    wf1:{ isInCooldown:false, remainingSeconds:0, reason:null },
    wf2:{ isHalted:false, remainingSeconds:0, netSold:0 }
  });
}
