"use client";
export function Card({className="", ...p}:any){return <div {...p} className={`rounded-xl border border-gray-200 bg-white ${className}`} />;}
export function CardHeader(p:any){return <div {...p} className={`p-4 border-b border-gray-100 ${p.className||""}`} />;}
export function CardTitle(p:any){return <div {...p} className={`text-base font-semibold flex items-center ${p.className||""}`} />;}
export function CardDescription(p:any){return <p {...p} className={`text-sm text-gray-500 ${p.className||""}`} />;}
export function CardContent(p:any){return <div {...p} className={`p-4 ${p.className||""}`} />;}
