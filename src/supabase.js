import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://wqkyajqkxqzzewmgukff.supabase.co';
const supabasePublishableKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indxa3lhanFreHF6emV3bWd1a2ZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzUzOTcsImV4cCI6MjEwMTU1MTM5N30.IMDQ_eSayS816BU950axpPsJguF7Q3K5QGkrD3LQv5Q';

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
