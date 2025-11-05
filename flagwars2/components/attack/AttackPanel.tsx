"use client";
import React, { useMemo } from "react";
import { AttackItem } from "@/lib/attack-flow";

interface AttackPanelProps {
  title: string;
  items: AttackItem[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
  showBalance?: boolean;
  showPrice?: boolean;
  loading?: boolean;
}

export default function AttackPanel({
  title,
  items,
  selectedId,
  onSelect,
  showBalance = false,
  showPrice = false,
  loading = false
}: AttackPanelProps) {
  const list = useMemo(() => items || [], [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        <span className="ml-2 text-white">Loading...</span>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-gray-400 text-lg mb-2">No countries available</div>
          <div className="text-gray-500 text-sm">
            {showBalance 
              ? "You don't own any country tokens yet" 
              : "No countries to attack"
            }
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-96 overflow-y-auto">
        {list.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`rounded-xl p-3 bg-white/5 hover:bg-white/10 border transition-all duration-200 ${
              selectedId === item.id 
                ? "border-emerald-400 bg-emerald-400/10" 
                : "border-white/10 hover:border-white/20"
            }`}
          >
            <div className="flex flex-col items-center">
              <img 
                src={item.flagUrl} 
                alt={item.name} 
                className="w-12 h-8 object-cover rounded-md border border-gray-600 mb-2" 
              />
              <div className="text-xs text-white/90 font-medium text-center">
                {item.name}
              </div>
              <div className="text-xs text-white/70 text-center">
                {item.code || `#${item.id}`}
              </div>
              
              {/* Balance display for attacker */}
              {showBalance && item.balance && (
                <div className="text-xs text-emerald-400 mt-1">
                  Owned: {parseFloat(item.balance).toFixed(2)}
                </div>
              )}
              
              {/* Price display for target */}
              {showPrice && item.price && (
                <div className="text-xs text-blue-400 mt-1">
                  ${parseFloat(item.price).toFixed(2)}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      
      {/* Selection info */}
      {selectedId && (
        <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="text-sm text-white/80">
            Selected: <span className="text-white font-medium">
              {list.find(item => item.id === selectedId)?.name || `Country ${selectedId}`}
            </span>
          </div>
          {showBalance && list.find(item => item.id === selectedId)?.balance && (
            <div className="text-xs text-emerald-400 mt-1">
              Balance: {parseFloat(list.find(item => item.id === selectedId)?.balance || "0").toFixed(4)} FLAG
            </div>
          )}
          {showPrice && list.find(item => item.id === selectedId)?.price && (
            <div className="text-xs text-blue-400 mt-1">
              Price: ${parseFloat(list.find(item => item.id === selectedId)?.price || "0").toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
