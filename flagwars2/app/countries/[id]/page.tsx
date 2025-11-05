"use client";
import { useEffect, useState } from "react";
import { contractReader, createContractWriter, computeAttackFee } from "@/lib/contracts";
import { formatBalance } from "@/lib/utils";

export default function CountryView({ params }: { params: { id: string } }) {
  const [info, setInfo] = useState<any>(null);
  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("1.0");
  const [txLoading, setTxLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [attackFee, setAttackFee] = useState<string>("0");
  const [attackFeeMode, setAttackFeeMode] = useState<string>("DIRECT_WEI");

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setErr("");
        const data = await contractReader.getCountryInfo(Number(params.id));
        setInfo(data);
      } catch (e: any) { 
        setErr(e.message);
        console.error("Country view error:", e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [params.id]);

  // Calculate attack fee when amount changes
  useEffect(() => {
    const calculateAttackFee = async () => {
      if (!info || !amount || parseFloat(amount) <= 0) {
        setAttackFee("0");
        return;
      }

      try {
        const tier = await contractReader.getCurrentTier(Number(params.id));
        const amountWei = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, 18)));
        
        const feeInfo = computeAttackFee(attackFeeMode as any, {
          attackFeeFromTier: BigInt(tier.attackFee),
          amountWei: amountWei
        });
        
        setAttackFee(feeInfo.msgValue.toString());
      } catch (error) {
        console.error("Error calculating attack fee:", error);
        setAttackFee("0");
      }
    };

    calculateAttackFee();
  }, [amount, info, attackFeeMode, params.id]);

  const handleBuy = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first");
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setTxLoading(true);
    setTxHash("");
    try {
      const writer = createContractWriter({});
      const result = await writer.buy({ 
        countryId: Number(params.id), 
        amount: amount 
      });
      setTxHash(result.hash);
      alert(`Buy transaction sent: ${result.hash.slice(0, 10)}...`);
    } catch (error: any) {
      console.error("Buy error:", error);
      alert(`Buy failed: ${error.message}`);
    } finally {
      setTxLoading(false);
    }
  };

  const handleSell = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first");
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setTxLoading(true);
    setTxHash("");
    try {
      const writer = createContractWriter({});
      const result = await writer.sell({ 
        countryId: Number(params.id), 
        amount: amount 
      });
      setTxHash(result.hash);
      alert(`Sell transaction sent: ${result.hash.slice(0, 10)}...`);
    } catch (error: any) {
      console.error("Sell error:", error);
      alert(`Sell failed: ${error.message}`);
    } finally {
      setTxLoading(false);
    }
  };

  const handleAttack = async () => {
    if (!isConnected) {
      alert("Please connect your wallet first");
      return;
    }
    
    if (!amount || parseFloat(amount) <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setTxLoading(true);
    setTxHash("");
    try {
      const writer = createContractWriter({});
      const result = await writer.attack({ 
        countryId: Number(params.id), 
        amount: amount 
      });
      setTxHash(result.hash);
      alert(`Attack transaction sent: ${result.hash.slice(0, 10)}...`);
    } catch (error: any) {
      console.error("Attack error:", error);
      alert(`Attack failed: ${error.message}`);
    } finally {
      setTxLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="card">
        <div style={{textAlign: 'center', padding: '2rem'}}>
          <div style={{fontSize: '1.5rem', marginBottom: '1rem'}}>⏳</div>
          <div>Loading country information...</div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="card">
        <div style={{
          background: 'var(--bg-panel-soft)',
          border: '1px solid #ef4444',
          borderRadius: '0.5rem',
          padding: '1rem',
          color: '#ef4444',
          textAlign: 'center'
        }}>
          <div style={{fontSize: '1.5rem', marginBottom: '0.5rem'}}>❌</div>
          <div style={{fontWeight: '600', marginBottom: '0.5rem'}}>Error</div>
          <div>{err}</div>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="card">
        <div style={{textAlign: 'center', padding: '2rem'}}>
          <div style={{fontSize: '1.5rem', marginBottom: '1rem'}}>❓</div>
          <div>No country information available</div>
        </div>
      </div>
    );
  }

  return (
    <div>
        <h1 style={{fontSize: '2rem', marginBottom: '1rem'}}>
          {info.name} (ID: {info.id})
        </h1>
        
        <div className="grid grid-cols-2" style={{gap: '1.5rem', marginBottom: '2rem'}}>
          <div className="card">
            <div className="card-header">
              <h3>Price Information</h3>
            </div>
            <div style={{fontSize: '1.5rem', fontWeight: '600', color: 'var(--gold)'}}>
              {formatBalance(info.price)} ETH
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Supply Information</h3>
            </div>
            <div>
              <div style={{marginBottom: '0.5rem'}}>
                <strong>Total Supply:</strong> {formatBalance(info.totalSupply)} tokens
              </div>
              <div>
                <strong>Reserve:</strong> {formatBalance(info.reserve || "0")} tokens
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Activity</h3>
            </div>
            <div>
              <div style={{marginBottom: '0.5rem'}}>
                <strong>Total Attacks:</strong> {info.attacks}
              </div>
              <div>
                <strong>Token Address:</strong> 
                <div style={{
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  background: 'var(--bg-panel-soft)',
                  padding: '0.5rem',
                  borderRadius: '0.25rem',
                  marginTop: '0.25rem',
                  wordBreak: 'break-all'
                }}>
                  {info.token}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Status</h3>
            </div>
            <div>
              <div style={{
                display: 'inline-block',
                background: info.exists ? 'var(--gold)' : '#ef4444',
                color: info.exists ? 'var(--text-dark)' : 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '0.25rem',
                fontWeight: '600',
                fontSize: '0.875rem'
              }}>
                {info.exists ? 'Active' : 'Inactive'}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Trading Actions</h3>
          </div>
          
          {!isConnected && (
            <div style={{
              background: 'var(--bg-panel-soft)',
              border: '1px solid var(--stroke)',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1rem',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              ⚠️ Please connect your wallet to trade
            </div>
          )}

          <div style={{marginBottom: '1rem'}}>
            <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '500'}}>
              Amount (ETH)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1.0"
              disabled={!isConnected || txLoading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--stroke)',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                background: 'var(--bg-panel-soft)',
                color: 'var(--text-primary)'
              }}
            />
          </div>

          <div style={{marginBottom: '1rem'}}>
            <label style={{display: 'block', marginBottom: '0.5rem', fontWeight: '500'}}>
              Attack Fee Mode
            </label>
            <select
              value={attackFeeMode}
              onChange={(e) => setAttackFeeMode(e.target.value)}
              disabled={!isConnected || txLoading}
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid var(--stroke)',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                background: 'var(--bg-panel-soft)',
                color: 'var(--text-primary)'
              }}
            >
              <option value="DIRECT_WEI">Direct Wei (Fixed Fee)</option>
              <option value="BPS_OF_AMOUNT">BPS of Amount (Percentage)</option>
              <option value="ERC20_USDC">ERC20 USDC (No ETH)</option>
            </select>
          </div>

          {attackFee !== "0" && (
            <div style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: 'var(--bg-panel-soft)',
              borderRadius: '0.5rem',
              border: '1px solid var(--gold)',
              textAlign: 'center'
            }}>
              <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>
                Attack Fee Preview:
              </div>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: 'var(--gold)'
              }}>
                {formatBalance(attackFee)} ETH
              </div>
              <div style={{fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem'}}>
                Mode: {attackFeeMode}
              </div>
            </div>
          )}

          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button 
              className="btn btn-primary" 
              onClick={handleBuy}
              disabled={!isConnected || txLoading || !amount || parseFloat(amount) <= 0}
              style={{
                opacity: (!isConnected || txLoading || !amount || parseFloat(amount) <= 0) ? 0.5 : 1
              }}
            >
              {txLoading ? "Processing..." : "Buy Tokens"}
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={handleSell}
              disabled={!isConnected || txLoading || !amount || parseFloat(amount) <= 0}
              style={{
                opacity: (!isConnected || txLoading || !amount || parseFloat(amount) <= 0) ? 0.5 : 1
              }}
            >
              {txLoading ? "Processing..." : "Sell Tokens"}
            </button>
            
            <button 
              className="btn btn-secondary" 
              onClick={handleAttack}
              disabled={!isConnected || txLoading || !amount || parseFloat(amount) <= 0}
              style={{
                opacity: (!isConnected || txLoading || !amount || parseFloat(amount) <= 0) ? 0.5 : 1
              }}
            >
              {txLoading ? "Processing..." : "Attack"}
            </button>
          </div>

          {txHash && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'var(--bg-panel-soft)',
              borderRadius: '0.5rem',
              border: '1px solid var(--gold)',
              textAlign: 'center'
            }}>
              <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem'}}>
                Transaction Hash:
              </div>
              <div style={{
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                color: 'var(--gold)',
                wordBreak: 'break-all'
              }}>
                {txHash}
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
