import { NextResponse } from "next/server";
export async function GET(){
  return NextResponse.json({
    success:true,
    remaining:2, totalLimit:2, used:0, history:[]
  });
}
