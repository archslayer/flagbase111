"use client";
import { useState } from "react";
import { contractReader, createContractWriter } from "@/lib/contracts";
import { useAccount } from "wagmi";

export function ActionPanel({ 
  countryId, 
  countryName, 
  userBalance, 
  onTransactionComplete 
}: { 
  countryId: number; 
  countryName: string; 
  userBalance: string; 
  onTransactionComplete: () => void; 
}) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("buy");
  const { address } = useAccount();

  const handleBuy = async () => {
    if (!address || !amount) return;
    setLoading(true);
    try {
      const writer = createContractWriter({});
      const result = await writer.buy({ countryId, amount });
      onTransactionComplete();
    } catch (error) {
      console.error("Buy error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSell = async () => {
    if (!address || !amount) return;
    setLoading(true);
    try {
      const writer = createContractWriter({});
      const result = await writer.sell({ countryId, amount });
      onTransactionComplete();
    } catch (error) {
      console.error("Sell error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 border rounded-lg overflow-hidden">
        <button 
          onClick={() => setActiveTab("buy")}
          className={`py-2 text-sm hover:bg-slate-50 ${activeTab === "buy" ? "bg-slate-100" : ""}`}
        >
          Buy
        </button>
        <button 
          onClick={() => setActiveTab("sell")}
          className={`py-2 text-sm hover:bg-slate-50 ${activeTab === "sell" ? "bg-slate-100" : ""}`}
        >
          Sell
        </button>
      </div>
      
      {activeTab === "buy" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Amount (USDC)</label>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
            />
          </div>
          <button 
            onClick={handleBuy} 
            disabled={loading || !address}
            className="btn btn-buy w-full"
          >
            {loading ? "Processing..." : "Buy"}
          </button>
        </div>
      )}
      
      {activeTab === "sell" && (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Amount (USDC)</label>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm"
            />
          </div>
          <button 
            onClick={handleSell} 
            disabled={loading || !address}
            className="btn btn-sell w-full"
          >
            {loading ? "Processing..." : "Sell"}
          </button>
        </div>
      )}
      
      <div className="text-sm text-slate-500">
        Balance: {userBalance} USDC
      </div>
    </div>
  );
}