"use client";
import * as React from "react";
export function Tabs({value,onValueChange,children}:{value:string;onValueChange:(v:string)=>void;children:any}){return <div data-value={value}>{children}</div>;}
export function TabsList({children,className=""}:{children:any;className?:string}){return <div className={`grid grid-cols-2 border rounded-lg overflow-hidden ${className}`}>{children}</div>;}
export function TabsTrigger({value,children}:{value:string;children:any}) {
  return <button onClick={(e)=>{const p=(e.currentTarget.parentElement?.parentElement as any); p?.dataset?.value!==value && (p?.props?.onValueChange?.(value));}} className="py-2 text-sm hover:bg-gray-50">{children}</button>;
}
export function TabsContent({value,children,className=""}:{value:string;children:any;className?:string}){return <div className={className}>{children}</div>}
