# Refine mobilisation + candidate records

## 1. Mobilisation becomes one single panel

Today each selected candidate has to be pushed through "Move to Medical", then "Move to Visa", then "Move to Mobilisation". That stepping is removed.

Inside a project's Mobilisation tab, every selected candidate gets one card holding all clearances together:

- **Medical** — tick, medical date, file upload
- **Visa** — tick, issue date, expiry date, file upload
- **Police Clearance** — tick only
- **Flight details** — date, number, departure airport + time, arrival airport + time (unchanged, same card)

The "Send On Site" button stays disabled until all three ticks are on and flight details are saved. Pressing it moves the candidate straight from Selected to On Site. Expiry warnings (passport, visa, medical) still flag anything expiring within 6 months of the project start date.

## 2. Skills renamed to Trade

Every screen says "Trade" instead of "Skills", and a candidate carries a single trade rather than a list.

## 3. Candidate record fields

The add/edit candidate form collects, in this order:

Surname, Name, Date of Birth (age shown automatically), Place of Birth, Address, Trade, Passport Number, Passport Issue Date, Passport Expiry Date, Place of Issue of Passport, Experience, Rating, Remarks.

The remark typed at creation is stored as the first entry of the append-only remarks log.

## 4. Candidate database table columns

The list shows: Surname, Name, Trade, Age, Passport No, Passport Expiry Date — plus status, which is needed for filtering and assignment. Filters keep working (trade filter replaces the skill filter).

## Technical notes

- Migration: add to `candidates` — `surname`, `date_of_birth`, `place_of_birth`, `address`, `trade`, `passport_issue_date`, `passport_place_of_issue`. Backfill `trade` from the first entry of `skills`; leave `skills` in place unused so nothing breaks, and stop writing to it.
- New table `mobilisation_clearances` (one row per candidate per project): medical_cleared/medical_date, visa_cleared/visa_issue_date/visa_expiry_date, police_cleared, timestamps, updated_by. GRANTs + RLS (staff read, writes only via server actions), updated_at trigger.
- New server actions in `src/lib/operations.functions.ts`: `setMobilisationClearance` (Mobilisation Executive/Admin, upsert, audit-logged) and a rewritten `changeCandidateStage` gate — Selected → On Site requires all three clearances plus a travel row for that candidate. Medical/Visa/Mobilisation statuses stay in the enum for historical records but are no longer produced.
- `getWorkspaceData` also returns clearances and the new candidate columns; `candidateInput` schema and `addCandidate`/`updateCandidateDetails` take the new fields; age derived client-side from `date_of_birth`.
- Document requirement stages Medical/Visa/Mobilisation are no longer used by the mobilisation flow; the Document requirements tab keeps managing pre-selection stages.
