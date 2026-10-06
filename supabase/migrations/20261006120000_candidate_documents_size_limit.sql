-- Allow uploads up to 10 MB in the candidate-documents bucket (CV limit).
-- Per-document limits are enforced by the app: Passport 1 MB, CV 10 MB, all other documents 3 MB.
UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'candidate-documents';
