export function formatAddress(a?:string){ if(!a) return "-"; return a.slice(0,6)+"…"+a.slice(-4); }
export function copyToClipboard(t:string){ return navigator.clipboard.writeText(t); }
export function generateReferralLink(code:string, baseUrl?: string){ 
  const base = baseUrl || (typeof window !== 'undefined' ? location.origin : 'http://localhost:3000');
  return `${base}/invite?ref=${code}`; 
}

export function getReferralFromUrl(){ 
  if (typeof window==="undefined") return null; 
  return new URLSearchParams(location.search).get("ref"); 
}

export function generateReferralCode(address: string): string {
  // Generate a short referral code from address
  return address.slice(2, 8).toUpperCase();
}
export function isValidAddress(a:string){ return /^0x[a-fA-F0-9]{40}$/.test(a); }
export function formatBalance(x:string, decimals:number = 18){ 
  try {
    const num = Number(x) / Math.pow(10, decimals);
    return num.toFixed(4);
  } catch {
    return "0.0000";
  }
}
export function calculateFee(amountWei:string, bps:number){ const n=BigInt(amountWei); return (n*BigInt(Math.floor(bps)))/BigInt(10000); }
export function calculateNetReceive(amountWei:string, totalFeeWei:number){ const n=BigInt(amountWei); const f=BigInt(totalFeeWei); return (n - f > 0n ? n - f : 0n); }
export function formatTimestamp(ts:number){ return new Date(ts).toLocaleString(); }
export function parseEther(_s:string){ /* placeholder */ return 0n as any; }
export function formatEther(_n:any){ return "0"; }
