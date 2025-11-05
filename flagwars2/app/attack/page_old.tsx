"use client";
import { useEffect, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { contractReader, createContractWriter } from "@/lib/contracts";
import { coreRead, createCoreWriter, formatUSDC } from "@/lib/core";

interface Flag {
  id: number;
  name: string;
  flagImage: string;
  price: string;
  change: string;
  code: string;
}

// Mock flags data (will be replaced by live data)
const flags: Flag[] = [
  {id:1, name:"Argentina", flagImage:"/flags/ARG.png", price:"$1,100", change:"+0.9%", code:"ARG"},
  {id:2, name:"Australia", flagImage:"/flags/AU.png", price:"$1,400", change:"+1.5%", code:"AU"},
  {id:3, name:"Brazil", flagImage:"/flags/BR.png", price:"$1,200", change:"-0.5%", code:"BR"},
  {id:4, name:"Canada", flagImage:"/flags/CA.png", price:"$1,350", change:"+3.2%", code:"CA"},
  {id:5, name:"Switzerland", flagImage:"/flags/CH.png", price:"$2,200", change:"+1.4%", code:"CH"},
  {id:6, name:"Germany", flagImage:"/flags/DE.png", price:"$1,800", change:"+1.3%", code:"DE"},
  {id:7, name:"France", flagImage:"/flags/FR.png", price:"$1,750", change:"+2.1%", code:"FR"},
  {id:8, name:"Greece", flagImage:"/flags/GR.png", price:"$1,050", change:"-0.8%", code:"GR"},
  {id:9, name:"India", flagImage:"/flags/IN.png", price:"$1,200", change:"+2.3%", code:"IN"},
  {id:10, name:"Japan", flagImage:"/flags/JP.png", price:"$2,100", change:"+8.7%", code:"JP"},
  {id:11, name:"South Korea", flagImage:"/flags/KR.png", price:"$1,300", change:"+2.7%", code:"KR"},
  {id:12, name:"Morocco", flagImage:"/flags/MO.png", price:"$950", change:"+1.2%", code:"MO"},
  {id:13, name:"Mexico", flagImage:"/flags/MX.png", price:"$1,150", change:"+1.1%", code:"MX"},
  {id:14, name:"Malaysia", flagImage:"/flags/MY.png", price:"$1,050", change:"+0.8%", code:"MY"},
  {id:15, name:"Nigeria", flagImage:"/flags/NG.png", price:"$850", change:"+2.1%", code:"NG"},
  {id:16, name:"Philippines", flagImage:"/flags/PH.png", price:"$900", change:"+1.5%", code:"PH"},
  {id:17, name:"Pakistan", flagImage:"/flags/PK.png", price:"$800", change:"+0.9%", code:"PK"},
  {id:18, name:"Poland", flagImage:"/flags/PL.png", price:"$1,250", change:"+2.5%", code:"PL"},
  {id:19, name:"Portugal", flagImage:"/flags/POR.png", price:"$1,300", change:"+1.9%", code:"POR"},
  {id:20, name:"Russia", flagImage:"/flags/RU.png", price:"$950", change:"-2.8%", code:"RU"},
  {id:21, name:"Saudi Arabia", flagImage:"/flags/SA.png", price:"$1,600", change:"+1.8%", code:"SA"},
  {id:22, name:"Singapore", flagImage:"/flags/SG.png", price:"$1,800", change:"+2.2%", code:"SG"},
  {id:23, name:"Spain", flagImage:"/flags/SP.png", price:"$1,450", change:"+0.8%", code:"SP"},
  {id:24, name:"Sweden", flagImage:"/flags/SW.png", price:"$1,650", change:"+1.8%", code:"SW"},
  {id:25, name:"Thailand", flagImage:"/flags/TH.png", price:"$1,100", change:"+1.3%", code:"TH"},
  {id:26, name:"Turkey", flagImage:"/flags/TR.png", price:"$890", change:"-2.1%", code:"TR"},
  {id:27, name:"Taiwan", flagImage:"/flags/TW.png", price:"$1,400", change:"+2.0%", code:"TW"},
  {id:28, name:"UAE", flagImage:"/flags/UAE.png", price:"$1,700", change:"+1.6%", code:"UAE"},
  {id:29, name:"United Kingdom", flagImage:"/flags/UK.png", price:"$1,950", change:"+3.4%", code:"UK"},
  {id:30, name:"Ukraine", flagImage:"/flags/UKR.png", price:"$750", change:"+5.2%", code:"UKR"},
  {id:31, name:"United States", flagImage:"/flags/USA.png", price:"$1,250", change:"+5.2%", code:"USA"},
  {id:32, name:"Venezuela", flagImage:"/flags/VE.png", price:"$650", change:"+3.1%", code:"VE"},
  {id:33, name:"Vietnam", flagImage:"/flags/VN.png", price:"$1,000", change:"+1.7%", code:"VN"},
  {id:34, name:"South Africa", flagImage:"/flags/ZA.png", price:"$1,000", change:"+1.8%", code:"ZA"},
];

export default function AttackPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  
  const [attackerFlag, setAttackerFlag] = useState<Flag | null>(null);
  const [targetFlag, setTargetFlag] = useState<Flag | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txHash, setTxHash] = useState<string>("");
  const [showTargets, setShowTargets] = useState<boolean | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [attackFee, setAttackFee] = useState<string>("");
  const [amount, setAmount] = useState<string>("0.01");

  // Check screen size and mock isConnected for now
  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    // Assume connected for UI testing
  }, []);

  // Calculate attack fee
  useEffect(() => {
    if (!targetFlag) {
      setAttackFee("");
      return;
    }

    async function calculateAttackFee() {
      try {
        const feeInfo = await coreRead.getCurrentTier(targetFlag.id);
        setAttackFee(formatUSDC(feeInfo.attackFeeUSDC6_orETHwei));
      } catch (error) {
        console.error("Error calculating attack fee:", error);
        // Fallback to environment variable
        const fallbackFee = process.env.NEXT_PUBLIC_ATTACK_FEE_WEI || "100000000000000";
        setAttackFee(formatUSDC(BigInt(fallbackFee)));
      }
    }

    calculateAttackFee();
  }, [targetFlag]);

  const handleAttack = async (multiplier: number = 1) => {
    if (!isConnected) {
      alert("Please connect your wallet first");
      return;
    }
    
    if (!attackerFlag || !targetFlag) {
      alert("Please select both attacker and target flags");
      return;
    }

    setTxLoading(true);
    setTxHash("");
    try {
      const writer = createCoreWriter(walletClient);
      const result = await writer.attack({ 
        fromCountryId: attackerFlag.id,
        toCountryId: targetFlag.id, 
        amount: (Number(amount) * multiplier).toString()
      });
      setTxHash(result.hash);
      alert(`Attack transaction sent: ${result.hash.slice(0, 10)}...`);
      
      // Record achievement
      try {
        await fetch('/api/achievements/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            event: 'attack',
            wallet: address,
            meta: { 
              fromCountryId: attackerFlag.id, 
              toCountryId: targetFlag.id, 
              amount: (Number(amount) * multiplier).toString() 
            }
          })
        });
      } catch (e) {
        console.log('Achievement record failed:', e);
      }
      
    } catch (error: any) {
      console.error("Attack error:", error);
      alert(`Attack failed: ${error.message}`);
    } finally {
      setTxLoading(false);
    }
  };

  return (
    <div style={{
      position: 'relative',
      minHeight: '100vh',
      backgroundImage: 'url(/attackbg.jpg)',
      backgroundSize: 'cover',
      backgroundPosition: typeof window !== 'undefined' && window.innerWidth < 768 ? 'center' : 'calc(50% + 128px) center',
      backgroundAttachment: 'fixed'
    }}>
      {/* Removed overlay to show background image clearly */}
      
      {/* Content */}
      <div style={{
        position: 'relative', 
        zIndex: 2, 
        padding: isMobile ? '1rem' : '2rem',
        maxWidth: '100%'
      }}>
        <h1 style={{color: 'white', textShadow: '2px 2px 4px rgba(0,0,0,0.8)'}}>⚔️ Attack</h1>
        <p style={{marginBottom: '2rem', color: 'white', textShadow: '1px 1px 2px rgba(0,0,0,0.8)'}}>Launch strategic attacks on other countries</p>
        

        {/* Flag Selection - VS Layout */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: isMobile ? '1rem' : '2rem',
          padding: isMobile ? '1rem' : '2rem',
          marginBottom: '2rem',
          flexWrap: isMobile ? 'wrap' : 'nowrap'
        }}>
            {/* Attacker Flag */}
            <div style={{textAlign: 'center'}}>
              <div style={{
                width: isMobile ? '180px' : '228px',
                height: isMobile ? '120px' : '152px',
                border: '2px dashed var(--stroke)',
                borderRadius: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: attackerFlag ? 'var(--bg-panel-soft)' : 'rgba(0, 0, 0, 0.5)',
                borderColor: attackerFlag ? 'var(--gold)' : 'var(--stroke)'
              }}
              onClick={() => setShowTargets(false)}
              >
                {attackerFlag ? (
                  <>
                    <img 
                      src={attackerFlag.flagImage} 
                      alt={attackerFlag.name}
                      style={{
                        width: isMobile ? '72px' : '91px',
                        height: isMobile ? '54px' : '68px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: '1px solid var(--stroke)',
                        marginBottom: '0.25rem'
                      }}
                    />
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--text-primary)'
                    }}>
                      {attackerFlag.code}
                    </div>
                  </>
                ) : (
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    color: 'white',
                    textAlign: 'center',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    lineHeight: '1.2'
                  }}>
                    Click to select<br/>your flag
                  </div>
                )}
              </div>
            </div>

            {/* VS Text */}
            <div style={{
                fontSize: isMobile ? '1.5rem' : '2rem',
              fontWeight: 'bold',
              color: 'var(--gold)',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
            }}>
              VS
            </div>

            {/* Target Flag */}
            <div style={{textAlign: 'center'}}>
              <div style={{
                width: isMobile ? '180px' : '228px',
                height: isMobile ? '120px' : '152px',
                border: '2px dashed var(--stroke)',
                borderRadius: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: targetFlag ? 'var(--bg-panel-soft)' : 'rgba(0, 0, 0, 0.5)',
                borderColor: targetFlag ? 'var(--gold)' : 'var(--stroke)'
              }}
              onClick={() => setShowTargets(true)}
              >
                {targetFlag ? (
                  <>
                    <img 
                      src={targetFlag.flagImage} 
                      alt={targetFlag.name}
                      style={{
                        width: isMobile ? '72px' : '91px',
                        height: isMobile ? '54px' : '68px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                        border: '1px solid var(--stroke)',
                        marginBottom: '0.25rem'
                      }}
                    />
                    <div style={{
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--text-primary)'
                    }}>
                      {targetFlag.code}
                    </div>
                  </>
                ) : (
                  <div style={{
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    color: 'white',
                    textAlign: 'center',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                    lineHeight: '1.2'
                  }}>
                    Click to select<br/>target flag
                  </div>
                )}
              </div>
            </div>
          </div>

        {/* Flag Selection Grid */}
        {showTargets !== null && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            borderRadius: '0.5rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            marginBottom: '2rem'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h3 style={{margin: 0, fontSize: '1rem', color: 'white'}}>
                {showTargets ? 'Select Target Flag' : 'Select Your Flag'}
              </h3>
              <button
                className="btn btn-secondary"
                onClick={() => setShowTargets(null)}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(80px, 1fr))' : 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '0.5rem',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {flags.map(flag => (
                <button
                  key={flag.id}
                  onClick={() => {
                    if (showTargets) {
                      setTargetFlag(flag);
                    } else {
                      setAttackerFlag(flag);
                    }
                    setShowTargets(null);
                  }}
                  style={{
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    minHeight: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                  }}
                >
                  <img 
                    src={flag.flagImage} 
                    alt={flag.name}
                    style={{
                      width: '32px',
                      height: '24px',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      marginBottom: '0.25rem'
                    }}
                  />
                  <div style={{
                    fontSize: '0.7rem',
                    fontWeight: '600',
                    color: 'white'
                  }}>
                    {flag.code}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Attack Buttons */}
        <div style={{
          display: 'flex',
          gap: isMobile ? '0.5rem' : '1rem',
          justifyContent: 'center',
          alignItems: 'center',
          padding: isMobile ? '1rem' : '2rem',
          marginBottom: '2rem',
          flexWrap: isMobile ? 'wrap' : 'nowrap'
        }}>
          <button
            className="btn btn-primary"
            onClick={() => handleAttack(1)}
            disabled={!isConnected || txLoading || !attackerFlag || !targetFlag}
            style={{
              fontSize: isMobile ? '1rem' : '1.1rem',
              padding: isMobile ? '0.75rem 1.5rem' : '1rem 2rem'
            }}
          >
            {txLoading ? "Attacking..." : "⚔️ Attack"}
          </button>
          
          <button
            className="btn btn-secondary"
            onClick={() => handleAttack(5)}
            disabled={!isConnected || txLoading || !attackerFlag || !targetFlag}
            style={{
              fontSize: isMobile ? '0.8rem' : '0.9rem',
              padding: isMobile ? '0.5rem 1rem' : '0.75rem 1.5rem'
            }}
          >
            {txLoading ? "Attacking..." : "⚔️ x5 Attack"}
          </button>
        </div>

        {/* Notes Section */}
        <div className="card" style={{
          marginBottom: '2rem',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div className="card-header">
            <h2 style={{color: 'white'}}>Attack Notes</h2>
          </div>
          
          <div style={{
            padding: '1rem',
            background: 'var(--bg-panel-soft)',
            borderRadius: '0.5rem',
            border: '1px solid var(--stroke)',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            lineHeight: '1.6'
          }}>
            <h4 style={{color: 'var(--text-primary)', marginBottom: '0.75rem', fontSize: '1rem'}}>How Attacks Work</h4>
            <ul style={{margin: 0, paddingLeft: '1.5rem', marginBottom: '1rem'}}>
              <li>Select your flag (attacker) and target flag</li>
              <li>Regular Attack: Standard attack power</li>
              <li>x5 Attack: 5x stronger attack but costs more</li>
              <li>Attack success depends on flag values and market conditions</li>
              <li>Successful attacks can change flag prices</li>
            </ul>
            
            <h4 style={{color: 'var(--text-primary)', marginBottom: '0.75rem', fontSize: '1rem'}}>Strategy Tips</h4>
            <ul style={{margin: 0, paddingLeft: '1.5rem'}}>
              <li>Attack weaker flags for better success rates</li>
              <li>Time your attacks during market volatility</li>
              <li>Use x5 attacks for high-value targets</li>
              <li>Monitor flag prices before attacking</li>
            </ul>
          </div>
        </div>

        {/* Transaction Hash */}
        {txHash && (
          <div className="card" style={{
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div className="card-header">
              <h3 style={{color: 'white'}}>Attack Transaction</h3>
            </div>
            <div style={{
              padding: '1rem',
              background: 'rgba(0, 0, 0, 0.5)',
              borderRadius: '0.5rem',
              border: '1px solid var(--gold)',
              textAlign: 'center'
            }}>
              <div style={{fontSize: '0.875rem', color: 'rgba(255, 255, 255, 0.7)', marginBottom: '0.5rem'}}>
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
          </div>
        )}
      </div>
    </div>
  );
}