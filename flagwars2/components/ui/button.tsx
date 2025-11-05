"use client";
import * as React from "react";
type Variant = "default" | "outline" | "success" | "buy" | "sell";
export function Button({
  className="", variant="default", size="md", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?:Variant; size?: "sm"|"md"|"lg"|"icon"}) {
  const base = "inline-flex items-center justify-center rounded-md border text-sm font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none h-9 px-3";
  const v = {
    default: "bg-gray-900 text-white border-gray-900 hover:bg-gray-800",
    outline: "bg-transparent border-gray-300 hover:bg-gray-50",
    success: "bg-green-600 text-white border-green-600 hover:bg-green-700",
    buy: "bg-green-600 text-white border-green-600 hover:bg-green-700",
    sell: "bg-orange-600 text-white border-orange-600 hover:bg-orange-700",
  }[variant];
  const s = size==="sm" ? "h-8 px-2 text-xs" : size==="lg" ? "h-10 px-4" : size==="icon" ? "h-9 w-9 p-0" : "";
  return <button className={`${base} ${v} ${s} ${className}`} {...props} />;
}
export default Button;
