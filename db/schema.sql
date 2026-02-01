-- Create OTP Verifications table
CREATE TABLE IF NOT EXISTS otp_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier text NOT NULL,
    otp_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    used boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow Service Role Full Access" ON otp_verifications
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
