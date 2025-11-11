"use client";
import * as React from "react";
export function Dialog({open, onOpenChange, children}:{open:boolean; onOpenChange:(v:boolean)=>void; children:any}) {
  if(!open) return null; return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={()=>onOpenChange(false)}>{children}</div>;
}
export function DialogContent({children}:{children:any}){return <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-4" onClick={e=>e.stopPropagation()}>{children}</div>;}
export function DialogHeader(p:any){return <div className="mb-2">{p.children}</div>;}
export function DialogTitle(p:any){return <h3 className="text-lg font-semibold">{p.children}</h3>;}
export function DialogDescription(p:any){return <p className="text-sm text-gray-500">{p.children}</p>;}
export function DialogFooter(p:any){return <div className="mt-4 flex justify-end gap-2">{p.children}</div>;}
