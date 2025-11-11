"use client";
export function Badge({children, variant="default", className=""}:{children:any;variant?:"default"|"outline"|"success";className?:string}) {
  const v = variant==="outline" ? "border border-gray-300 text-gray-700" : variant==="success" ? "bg-green-600 text-white" : "bg-gray-800 text-white";
  return <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${v} ${className}`}>{children}</span>;
}
export default Badge;
