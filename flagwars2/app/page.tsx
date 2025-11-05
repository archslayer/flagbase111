export default function Home(){
  return (
    <div>
      <h1>🏴 Welcome to FlagWars</h1>
      <p style={{fontSize: '1.2rem', marginBottom: '2rem'}}>
        The Ultimate Flag Trading Game on Base Network
      </p>
      
      <div className="card">
        <div className="card-header">
          <h2>🎮 How to Play</h2>
        </div>
        <div className="grid grid-cols-2">
          <div>
            <h3>1. Connect Wallet</h3>
            <p>Link your MetaMask or other Web3 wallet to get started</p>
          </div>
          <div>
            <h3>2. Trade Flags</h3>
            <p>Buy and sell country flags based on market trends</p>
          </div>
          <div>
            <h3>3. Complete Quests</h3>
            <p>Earn rewards by completing daily challenges</p>
          </div>
          <div>
            <h3>4. Invite Friends</h3>
            <p>Refer others and earn 5% from their trades</p>
          </div>
        </div>
      </div>

      <div className="card" style={{
        background: 'linear-gradient(135deg, var(--gold) 0%, var(--amber) 100%)',
        color: 'var(--bg-primary)',
        textAlign: 'center'
      }}>
        <h2 style={{color: 'var(--bg-primary)', marginBottom: '1rem'}}>Ready to Start Trading?</h2>
        <p style={{color: 'var(--bg-primary)', opacity: 0.9, marginBottom: '1.5rem'}}>
          Connect your wallet and start your flag trading journey today!
        </p>
        <button className="btn" style={{
          background: 'var(--bg-primary)',
          color: 'var(--gold)',
          fontSize: '1.1rem',
          padding: '1rem 2rem'
        }}>
          🚀 Get Started
        </button>
      </div>
    </div>
  );
}
