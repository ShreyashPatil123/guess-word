import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://wngypbnxqoqrcwyxmjwr.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduZ3lwYm54cW9xcmN3eXhtandyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTQyNjIsImV4cCI6MjA4NTE5MDI2Mn0.3mZN3IQSOI9Hfj32E7owykdt3HZmh37oVBWi4o4yOlc'

// Initialize strictly as requested
if (!window.supabase) {
    window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    console.log('[Supabase] Client initialized via ESM')
} else {
    console.warn('[Supabase] Client already exists, skipping init')
}
