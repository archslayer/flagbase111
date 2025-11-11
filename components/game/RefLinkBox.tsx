"use client";
import { useState, useEffect } from "react";
import { copyToClipboard, generateReferralLink } from "@/lib/utils";

export function RefLinkBox() {
  const [refData, setRefData] = useState({
    referralCode: "",
    referralLink: "",
    invitedCount: 0,
    claimableTotal: "0",
    claimedTotal: "0"
  });

  useEffect(() => {
    fetch("/api/referrals/my")
      .then(res => res.json())
      .then(data => setRefData(data))
      .catch(console.error);
  }, []);

  const handleCopyLink = () => {
    copyToClipboard(refData.referralLink);
  };

  const handleClaim = async () => {
    try {
      const response = await fetch("/api/referrals/claim", { method: "POST" });
      const data = await response.json();
      if (data.ok) {
        // Refresh data
        fetch("/api/referrals/my")
          .then(res => res.json())
          .then(data => setRefData(data));
      }
    } catch (error) {
      console.error("Claim error:", error);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Your Referral Code</label>
        <div className="flex gap-2 mt-1">
          <input 
            value={refData.referralCode} 
            readOnly 
            className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
          />
          <button onClick={handleCopyLink} className="btn btn-outline">Copy</button>
        </div>
      </div>
      
      <div>
        <label className="text-sm font-medium">Referral Link</label>
        <div className="flex gap-2 mt-1">
          <input 
            value={refData.referralLink} 
            readOnly 
            className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
          />
          <button onClick={handleCopyLink} className="btn btn-outline">Copy</button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{refData.invitedCount}</div>
          <div className="text-sm text-slate-500">Invited</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{refData.claimableTotal}</div>
          <div className="text-sm text-slate-500">Claimable USDC</div>
        </div>
      </div>
      
      {parseFloat(refData.claimableTotal) > 0 && (
        <button onClick={handleClaim} className="btn btn-success w-full">
          Claim Rewards
        </button>
      )}
    </div>
  );
}