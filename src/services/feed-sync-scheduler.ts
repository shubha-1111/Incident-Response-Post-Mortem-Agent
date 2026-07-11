let cron: any;
try {
  cron = require('node-cron');
} catch {
  console.warn('[feed-sync-scheduler] node-cron not installed - scheduler disabled');
}

export function startFeedSyncScheduler(): void {
  if (!cron) {
    console.log('[feed-sync-scheduler] Skipping scheduler startup - node-cron not available');
    return;
  }
  
  // Sync MISP every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('Starting MISP sync...');
    try {
      const { syncMISPEvents } = await import('./misp-sync.js');
      await syncMISPEvents();
    } catch (err) {
      console.error('MISP sync error:', err);
    }
  });

  // Sync TAXII every hour
  cron.schedule('0 * * * *', async () => {
    console.log('Starting TAXII sync...');
    try {
      const { syncTaxiiFeeds } = await import('./taxii-sync.js');
      await syncTaxiiFeeds();
    } catch (err) {
      console.error('TAXII sync error:', err);
    }
  });

  // Sync CISA KEV every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('Starting CISA KEV sync...');
    try {
      const { syncCISAKEV } = await import('./cisa-kev-sync.js');
      await syncCISAKEV();
    } catch (err) {
      console.error('CISA KEV sync error:', err);
    }
  });

  console.log('Feed sync scheduler started');
}