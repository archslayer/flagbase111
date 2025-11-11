"use client";
import { useState, useEffect } from "react";

export function WhiteFlagWarning({ countryId }: { countryId: number }) {
  const [wfStatus, setWfStatus] = useState({
    wf1: { isInCooldown: false, remainingSeconds: 0, reason: null },
    wf2: { isHalted: false, remainingSeconds: 0, netSold: 0 }
  });

  useEffect(() => {
    fetch(`/api/white-flag/status?countryId=${countryId}`)
      .then(res => res.json())
      .then(data => setWfStatus(data))
      .catch(console.error);
  }, [countryId]);

  const hasActiveWF = wfStatus.wf1.isInCooldown || wfStatus.wf2.isHalted;

  if (!hasActiveWF) return null;

  return (
    <div className="border-orange-200 bg-orange-50 card">
      <div className="card-header">
        <div className="card-title text-orange-800">⚠️ White Flag Active</div>
      </div>
      <div className="card-content">
        <div className="space-y-2 text-sm">
          {wfStatus.wf1.isInCooldown && (
            <div className="flex items-center gap-2">
              <span className="badge badge-soft">WF1</span>
              <span>Cooldown: {wfStatus.wf1.remainingSeconds}s</span>
            </div>
          )}
          {wfStatus.wf2.isHalted && (
            <div className="flex items-center gap-2">
              <span className="badge badge-soft">WF2</span>
              <span>Halted: {wfStatus.wf2.remainingSeconds}s</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}