// Idempotency cleanup utilities
import { getDb } from "@/lib/mongodb";

const TTL_SEC = 24 * 60 * 60; // 24 hours
const STUCK_THRESHOLD_SEC = 30 * 60; // 30 minutes - keys stuck in PENDING for too long

export async function cleanupExpiredIdempotencyKeys(): Promise<{
  deleted: number;
  stuck: number;
  errors: string[];
}> {
  const result: {
    deleted: number;
    stuck: number;
    errors: string[];
  } = {
    deleted: 0,
    stuck: 0,
    errors: []
  };

  try {
    const db = await getDb();
    const collection = db.collection('idempotency');
    
    const now = Date.now();
    const expiredThreshold = now - (TTL_SEC * 1000);
    const stuckThreshold = now - (STUCK_THRESHOLD_SEC * 1000);
    
    // Clean up expired keys (older than TTL)
    const expiredResult = await collection.deleteMany({
      ts: { $lt: expiredThreshold }
    });
    result.deleted = expiredResult.deletedCount;
    
    // Find stuck keys (PENDING status for too long)
    const stuckKeys = await collection.find({
      status: 'PENDING',
      ts: { $lt: stuckThreshold }
    }).toArray();
    result.stuck = stuckKeys.length;
    
    // Optionally clean up stuck keys (uncomment if needed)
    // if (stuckKeys.length > 0) {
    //   const stuckIds = stuckKeys.map(k => k.key);
    //   await collection.deleteMany({ key: { $in: stuckIds } });
    // }
    
    console.log(`Idempotency cleanup: deleted ${result.deleted} expired keys, found ${result.stuck} stuck keys`);
    
  } catch (error: any) {
    result.errors.push(error.message);
    console.error('Idempotency cleanup error:', error);
  }

  return result;
}

export async function getIndexStatistics(): Promise<{
  totalKeys: number;
  pendingKeys: number;
  succeededKeys: number;
  failedKeys: number;
  expiredKeys: number;
}> {
  try {
    const db = await getDb();
    const collection = db.collection('idempotency');
    
    const now = Date.now();
    const expiredThreshold = now - (TTL_SEC * 1000);
    
    const [totalKeys, pendingKeys, succeededKeys, failedKeys, expiredKeys] = await Promise.all([
      collection.countDocuments({}),
      collection.countDocuments({ status: 'PENDING' }),
      collection.countDocuments({ status: 'SUCCEEDED' }),
      collection.countDocuments({ status: 'FAILED' }),
      collection.countDocuments({ ts: { $lt: expiredThreshold } })
    ]);
    
    return {
      totalKeys,
      pendingKeys,
      succeededKeys,
      failedKeys,
      expiredKeys
    };
  } catch (error: any) {
    console.error('Idempotency statistics error:', error);
    // Return zeros on error to avoid breaking admin UI
    return {
      totalKeys: 0,
      pendingKeys: 0,
      succeededKeys: 0,
      failedKeys: 0,
      expiredKeys: 0
    };
  }
}

export async function forceCleanupStuckKeys(): Promise<{
  cleaned: number;
  errors: string[];
}> {
  const result: {
    cleaned: number;
    errors: string[];
  } = {
    cleaned: 0,
    errors: []
  };

  try {
    const db = await getDb();
    const collection = db.collection('idempotency');
    
    const now = Date.now();
    const stuckThreshold = now - (STUCK_THRESHOLD_SEC * 1000);
    
    // Force cleanup stuck keys (PENDING status for too long)
    const deleteResult = await collection.deleteMany({
      status: 'PENDING',
      ts: { $lt: stuckThreshold }
    });
    
    result.cleaned = deleteResult.deletedCount;
    console.log(`Force cleanup: cleaned ${result.cleaned} stuck keys`);
  } catch (error: any) {
    result.errors.push(error.message);
    console.error('Force cleanup error:', error);
  }

  return result;
}
