// app/api/referral/preview/route.ts
// NOT: Bu route projede hiç olmayan bir dosyayı import ediyordu.
// Build'i bloklamasın diye geçici olarak boş cevap dönüyoruz.

import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      reason: 'referral preview route is disabled because original file did not exist in 3 Nov backup',
    },
    { status: 200 }
  )
}
