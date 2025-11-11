export default function PrivacyPage() {
  return (
    <div style={{ padding: '3rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        Flag Wars Privacy Notice
      </h1>
      
      <div style={{ 
        fontSize: '0.875rem', 
        color: 'var(--text-muted)', 
        marginBottom: '2rem' 
      }}>
        Effective date: 30.10.2025<br />
        Controller: [Operator legal name], together with its affiliates, &quot;Flag Wars&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;.<br />
        Contact: [privacy@yourdomain] or [URL to contact form]
      </div>
      
      <div style={{ 
        background: 'var(--bg-panel)', 
        padding: '2rem', 
        borderRadius: '0.75rem',
        border: '1px solid var(--stroke)',
      }}>
        <div style={{ color: 'var(--text-primary)', lineHeight: '1.6' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            1) Scope
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            This Notice applies to our website, app, smart contracts, Discord, and any related services (the &quot;Platform&quot;). By connecting a wallet or using the Platform, you acknowledge this Privacy Notice.
          </p>
          
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            2) What we collect
          </h2>
          
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            You provide
          </h3>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>Wallet address and signature proofs.</li>
            <li>Discord ID or username if you join our community.</li>
            <li>Email or other contact details if you reach out to us.</li>
            <li>KYC data only if we request it for compliance. This may include identity documents and face images and is collected and processed by a vetted third-party provider.</li>
          </ul>

          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            Collected automatically
          </h3>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>Device, browser, operating system, and app version.</li>
            <li>IP address, timestamps, pages viewed, event and error logs, and approximate location inferred from IP.</li>
            <li>Referral codes and campaign parameters you use.</li>
            <li>Cookies and local storage for session, preferences, anti-abuse, and performance.</li>
          </ul>

          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            Public blockchain data
          </h3>
          <p style={{ marginBottom: '1.5rem' }}>
            On-chain data is public by design. This includes your wallet address, transactions, token balances, and interactions with our contracts. Anyone can read or analyze it on block explorers. We do not control or delete blockchain data.
          </p>

          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', marginTop: '1.5rem', marginBottom: '0.75rem' }}>
            We do not collect
          </h3>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>Private keys, seed phrases, or custodial access to your wallet.</li>
          </ul>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            3) How we use data
          </h2>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>Provide, maintain, and improve gameplay, contracts, and features.</li>
            <li>Secure the Platform, prevent fraud, detect abuse and exploits, and enforce Terms.</li>
            <li>Operate referrals, achievements, and rewards.</li>
            <li>Measure performance and fix bugs.</li>
            <li>Comply with legal obligations and requests.</li>
            <li>Communicate with you when you contact us or where you opt in.</li>
          </ul>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            4) Legal bases (EEA/UK users)
          </h2>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>Performance of a contract, for core features you request.</li>
            <li>Legitimate interests, such as security, anti-abuse, analytics that respects privacy, and product improvement.</li>
            <li>Consent, where required for certain cookies or optional features.</li>
            <li>Legal obligations, such as sanctions checks or record-keeping.</li>
          </ul>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            5) Sharing and disclosures
          </h2>
          <p style={{ marginBottom: '1rem' }}>
            We use service providers that process data for us, including:
          </p>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li>Hosting, CDN, and cloud infrastructure.</li>
            <li>RPC and node providers, indexers, and block explorers.</li>
            <li>Wallet connection libraries and analytics that respect privacy.</li>
            <li>Error tracking, logging, and security tooling.</li>
            <li>KYC providers if compliance checks are required.</li>
            <li>Community platforms such as Discord.</li>
          </ul>
          <p style={{ marginBottom: '1.5rem' }}>
            We disclose information if required by law, in connection with a merger or acquisition, or to protect users, the Platform, and our rights. We do not sell personal information and we do not share it for cross-context behavioral advertising.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            6) Cookies and local storage
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            We use only what is necessary for login state, preferences, anti-abuse, performance, and basic analytics. You can control cookies in your browser. Some features may not work without them.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            7) Retention
          </h2>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1.5rem' }}>
            <li><strong>On-chain data:</strong> permanent and public.</li>
            <li><strong>Server logs and security logs:</strong> typically up to 12 months unless longer is needed for investigations or legal obligations.</li>
            <li><strong>Support and compliance records:</strong> as required by law or up to 6 years where appropriate.</li>
          </ul>
          <p style={{ marginBottom: '1.5rem' }}>
            If you request deletion, we will delete or anonymize off-chain data unless we must keep it by law or for security.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            8) Security
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            We use administrative, technical, and organizational measures to protect data. No method is perfect. Web3 carries special risks, including wallet compromise, phishing, RPC outages, protocol changes, and public linkage of addresses. Keep your devices and keys secure. We cannot control third-party infrastructure or the public blockchain.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            9) Your rights
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            Depending on your region, you may have rights to access, correct, delete, restrict, object to processing, or request portability of your personal data. You may also have the right to lodge a complaint with your local supervisory authority. For California residents, you have rights to know, delete, correct, and to opt out of sale or sharing. We do not sell or share personal information as defined by California law.
          </p>
          <p style={{ marginBottom: '1.5rem' }}>
            To exercise rights, contact us at [privacy@yourdomain]. We will verify your request using your wallet signature, email verification, or other reasonable means. We cannot alter or remove blockchain data.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            10) International transfers
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            We operate globally and may transfer data to countries without the same level of protection as your home country. Where required, we use appropriate safeguards such as Standard Contractual Clauses.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            11) Children
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            The Platform is for adults 18+. We do not knowingly collect data from children. If you believe a minor has used the Platform, contact us for removal of off-chain data.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            12) Third-party services and links
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            Your use of wallets, RPCs, explorers, clouds, Discord, and other third-party services is subject to their own terms and privacy policies. We are not responsible for their practices. Review their policies carefully.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            13) Changes
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            We may update this Notice. We will post the new effective date in the app. Your continued use means you acknowledge the updated Notice.
          </p>

          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', marginTop: '2rem', marginBottom: '1rem' }}>
            14) Contact
          </h2>
          <p style={{ marginBottom: '1.5rem' }}>
            Controller: [Operator legal name]<br />
            Address: [Business address, Dubai, UAE]<br />
            Email: [privacy@yourdomain]<br />
            Discord: [link or handle] for general contact only. Privacy requests should be sent by email.
          </p>
        </div>
      </div>
    </div>
  )
}

