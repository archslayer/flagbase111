"use client";
import React from "react";

interface AttackLayoutProps {
  left: React.ReactNode;
  right: React.ReactNode;
  footer: React.ReactNode;
}

export default function AttackLayout({ left, right, footer }: AttackLayoutProps) {
  return (
    <div className="relative min-h-[calc(100vh-80px)] bg-gradient-to-br from-red-900 via-gray-900 to-black">
      {/* Background overlay for better text readability */}
      <div className="absolute inset-0 bg-black/40" />
      
      {/* Main content */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            ⚔️ Attack
          </h1>
          <p className="text-gray-300 text-lg">
            Launch strategic attacks on other countries
          </p>
        </div>

        {/* Attack panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Left panel - Attacker */}
          <div className="rounded-2xl bg-black/50 backdrop-blur-sm border border-gray-700 p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-white mb-2">Attacker</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-red-500 to-orange-500 mx-auto rounded"></div>
            </div>
            {left}
          </div>

          {/* Right panel - Attacked */}
          <div className="rounded-2xl bg-black/50 backdrop-blur-sm border border-gray-700 p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-white mb-2">Target</h2>
              <div className="w-16 h-1 bg-gradient-to-r from-blue-500 to-cyan-500 mx-auto rounded"></div>
            </div>
            {right}
          </div>
        </div>

        {/* Footer - Attack controls */}
        <div className="max-w-4xl mx-auto">
          {footer}
        </div>
      </div>
    </div>
  );
}
