"use client";
import { useState, useEffect } from "react";

export default function FreeAttackStatus({ showHistory = false }: { showHistory?: boolean }) {
  const [status, setStatus] = useState({
    remaining: 2,
    totalLimit: 2,
    used: 0,
    history: []
  });

  useEffect(() => {
    // Mock data - replace with real API call
    fetch("/api/free-attacks/my")
      .then(res => res.json())
      .then(data => setStatus(data))
      .catch(console.error);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm">Remaining:</span>
        <span className={`badge ${status.remaining > 0 ? "badge-success" : "badge-soft"}`}>
          {status.remaining} / {status.totalLimit}
        </span>
      </div>
      
      {status.remaining > 0 && (
        <button className="btn btn-outline w-full">
          Use Free Attack
        </button>
      )}
      
      {showHistory && status.history.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Recent Attacks</h4>
          <div className="space-y-1">
            {status.history.map((attack: any, index: number) => (
              <div key={index} className="text-xs text-slate-600">
                Attack #{attack.id} - {attack.country} - {attack.timestamp}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}