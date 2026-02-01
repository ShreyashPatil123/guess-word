/**
 * Vercel Cron Job: Cleanup Expired Pending Signups
 * 
 * This endpoint is called by Vercel's cron scheduler to clean up
 * expired signup attempts from the pending_signups table.
 * 
 * Schedule: Every 6 hours (configured in vercel.json)
 * Security: Protected by CRON_SECRET header
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // Verify cron secret to prevent unauthorized access
    const authHeader = req.headers.authorization;
    const cronSecret = process.env.CRON_SECRET;
    
    // In production, require the secret; in dev, allow without
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        console.error('[Cron] Unauthorized cleanup attempt');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
        console.error('[Cron] Missing Supabase credentials');
        return res.status(500).json({ error: 'Database not configured' });
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    try {
        // Call the cleanup RPC function
        const { data, error } = await supabase.rpc('cleanup_expired_pending_signups');
        
        if (error) {
            console.error('[Cron] Cleanup RPC error:', error);
            return res.status(500).json({ error: 'Cleanup failed', details: error.message });
        }
        
        console.log(`[Cron] Cleanup complete: ${data} expired signups removed`);
        res.json({ 
            success: true, 
            deleted: data,
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error('[Cron] Unexpected error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
};
