"use client";
import { useEffect, useState } from "react";

interface MaintenanceMode {
  enabled: boolean;
  message: string;
  startTime: number;
  endTime: number;
}

interface CleanupStats {
  totalKeys: number;
  pendingKeys: number;
  succeededKeys: number;
  failedKeys: number;
  expiredKeys: number;
}

export default function AdminPage() {
  const [maintenance, setMaintenance] = useState<MaintenanceMode>({
    enabled: false,
    message: "",
    startTime: 0,
    endTime: 0
  });
  const [cleanupStats, setCleanupStats] = useState<CleanupStats>({
    totalKeys: 0,
    pendingKeys: 0,
    succeededKeys: 0,
    failedKeys: 0,
    expiredKeys: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string>("");

  useEffect(() => {
    const loadAdminData = async () => {
      try {
        setLoading(true);
        
        // Load maintenance mode
        const maintenanceResponse = await fetch('/api/admin/maintenance', {
          headers: {
            'x-user-address': '0xc32e33f743cf7f95d90d1392771632ff1640de16' // Mock admin address
          }
        });
        
        if (maintenanceResponse.ok) {
          const maintenanceData = await maintenanceResponse.json();
          setMaintenance(maintenanceData);
        }
        
        // Load cleanup stats
        const cleanupResponse = await fetch('/api/admin/cleanup', {
          headers: {
            'x-user-address': '0xc32e33f743cf7f95d90d1392771632ff1640de16' // Mock admin address
          }
        });
        
        if (cleanupResponse.ok) {
          const cleanupData = await cleanupResponse.json();
          setCleanupStats(cleanupData);
        }
        
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadAdminData();
  }, []);

  const handleMaintenanceToggle = async () => {
    setActionLoading('maintenance');
    try {
      const response = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': '0xc32e33f743cf7f95d90d1392771632ff1640de16'
        },
        body: JSON.stringify({
          enabled: !maintenance.enabled,
          message: maintenance.message || "System is under maintenance. Please try again later."
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMaintenance(data.maintenance);
        alert(`Maintenance mode ${data.maintenance.enabled ? 'enabled' : 'disabled'}`);
      } else {
        const error = await response.json();
        alert(`Failed: ${error.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  };

  const handleCleanup = async (force: boolean = false) => {
    setActionLoading(force ? 'force-cleanup' : 'cleanup');
    try {
      const response = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': '0xc32e33f743cf7f95d90d1392771632ff1640de16'
        },
        body: JSON.stringify({ force })
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`Cleanup completed: ${JSON.stringify(data.result)}`);
        // Reload stats
        window.location.reload();
      } else {
        const error = await response.json();
        alert(`Failed: ${error.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div>
        <h1>🔧 Admin Panel</h1>
        <div className="card">
          <div style={{textAlign: 'center', padding: '2rem'}}>
            <div style={{fontSize: '1.5rem', marginBottom: '1rem'}}>⏳</div>
            <div>Loading admin data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1>🔧 Admin Panel</h1>
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
            <div>{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>🔧 Admin Panel</h1>
      <p style={{marginBottom: '2rem'}}>System administration and maintenance tools</p>
      
      {/* Maintenance Mode */}
      <div className="card" style={{marginBottom: '2rem'}}>
        <div className="card-header">
          <h2>Maintenance Mode</h2>
        </div>
        
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem',
          background: 'var(--bg-panel-soft)',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          border: '1px solid var(--stroke)'
        }}>
          <div>
            <div style={{fontWeight: '500', color: 'var(--text-primary)', marginBottom: '0.25rem'}}>
              Status: {maintenance.enabled ? 'Enabled' : 'Disabled'}
            </div>
            {maintenance.enabled && (
              <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>
                Message: {maintenance.message}
              </div>
            )}
          </div>
          <button
            className={`btn ${maintenance.enabled ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleMaintenanceToggle}
            disabled={actionLoading === 'maintenance'}
          >
            {actionLoading === 'maintenance' ? 'Processing...' : 
             maintenance.enabled ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Cleanup Statistics */}
      <div className="card" style={{marginBottom: '2rem'}}>
        <div className="card-header">
          <h2>Idempotency Cleanup</h2>
        </div>
        
        <div className="grid grid-cols-2" style={{gap: '1rem', marginBottom: '1rem'}}>
          <div className="card" style={{textAlign: 'center', padding: '1rem'}}>
            <div style={{fontSize: '2rem', fontWeight: 'bold', color: 'var(--gold)'}}>
              {cleanupStats.totalKeys}
            </div>
            <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>Total Keys</div>
          </div>
          <div className="card" style={{textAlign: 'center', padding: '1rem'}}>
            <div style={{fontSize: '2rem', fontWeight: 'bold', color: 'var(--amber)'}}>
              {cleanupStats.pendingKeys}
            </div>
            <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>Pending</div>
          </div>
          <div className="card" style={{textAlign: 'center', padding: '1rem'}}>
            <div style={{fontSize: '2rem', fontWeight: 'bold', color: '#10b981'}}>
              {cleanupStats.succeededKeys}
            </div>
            <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>Succeeded</div>
          </div>
          <div className="card" style={{textAlign: 'center', padding: '1rem'}}>
            <div style={{fontSize: '2rem', fontWeight: 'bold', color: '#ef4444'}}>
              {cleanupStats.failedKeys}
            </div>
            <div style={{fontSize: '0.875rem', color: 'var(--text-secondary)'}}>Failed</div>
          </div>
        </div>
        
        <div style={{display: 'flex', gap: '1rem'}}>
          <button
            className="btn btn-primary"
            onClick={() => handleCleanup(false)}
            disabled={actionLoading === 'cleanup'}
          >
            {actionLoading === 'cleanup' ? 'Cleaning...' : 'Run Cleanup'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => handleCleanup(true)}
            disabled={actionLoading === 'force-cleanup'}
          >
            {actionLoading === 'force-cleanup' ? 'Force Cleaning...' : 'Force Cleanup'}
          </button>
        </div>
      </div>
    </div>
  );
}
