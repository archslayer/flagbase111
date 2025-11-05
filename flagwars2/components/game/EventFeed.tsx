"use client";
import { useGameStore } from "@/lib/store";
import { formatTimestamp } from "@/lib/utils";

export function EventFeed() {
  const { recentTransactions } = useGameStore();

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {recentTransactions.length === 0 ? (
        <p className="text-sm text-slate-500">No recent activity</p>
      ) : (
        recentTransactions.map((tx, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs">
                {tx.type === "buy" ? "🟢" : tx.type === "sell" ? "🔴" : "⚔️"}
              </span>
              <span className="capitalize">{tx.type}</span>
            </div>
            <div className="text-slate-500">
              {formatTimestamp(tx.timestamp)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}