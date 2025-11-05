"use client";
import { useEffect, useState } from "react";
export default function Authed({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean|null>(null);
  useEffect(()=>{ let m=true; fetch("/api/me").then(r=>r.json()).then(d=>{ if(!m) return; setOk(!!d.user); if(!d.user){ const u=new URL(location.href); u.pathname="/"; u.searchParams.set("needLogin","1"); location.href=u.toString(); } }); return ()=>{m=false}; },[]);
  if(ok===null) return <div className="section p-4">Checking session…</div>;
  if(!ok) return null;
  return <>{children}</>;
}
