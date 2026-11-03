-- Interview date set when a candidate is moved to Interview (editable while they are at that stage).
-- Cleared with the ratings when the candidate returns to Available.
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS interview_date date;