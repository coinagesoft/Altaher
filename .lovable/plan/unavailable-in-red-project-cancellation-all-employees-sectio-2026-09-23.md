# Unavailable in red, project cancellation, All Employees section

## 1. Unavailable shown in red

In the Candidate Database, the Unavailable status badge turns red (same treatment Available has in green) everywhere the status badge appears.

## 2. Cancel a project

Inside a project, Project Coordinators and Admins get a **Cancel project** button that asks for confirmation and a short reason.

When a project is cancelled:
- Every candidate currently attached to it goes back to **Available** and is unlinked from the project.
- Each person's assignment is closed with the reason "Project cancelled" and it is written into their history, so their record still shows they worked on it.
- The project is marked **Cancelled** (badge in the project list and on the project page) and no new candidates can be assigned to it.

## 3. New "All Employees" section

A new tab after On Site listing everyone who reached mobilisation or beyond for this project: currently in Mobilisation, On Site, R&R — plus people already marked EOC (or released when a project was cancelled), pulled from their assignment history.

Each row shows the person, their stage (Mobilisation / On Site / R&R / EOC) and clicking the name opens their profile panel like the other tabs.

A **Download Excel** button exports a sheet whose top line reads "Project Name - Client Name - Country of Employment", then these columns:
Employee number, Surname, Name, Trade, Date of Birth, Passport number, Issue Date, Expiry Date, Stage, Medical Date, Visa Date, Police Clearance Date, Travel Date.

## 4. Document requirements keeps past employees

The Document requirements list now also includes people marked EOC (and anyone who previously worked on the project), so their documents stay reachable. Download All and each row's zip cover them too.

## Technical notes

- Migration: `projects.cancelled_at timestamptz`, `projects.cancel_reason text`.
- `getWorkspaceData` projects select adds the two new columns.
- New `cancelProject` server fn (PC/Admin): sets cancelled_at/cancel_reason, bulk-updates candidates on the project to Available with `current_project_id = null`, closes open `candidate_assignments` rows (`ended_at`, `end_reason` "Project cancelled", `final_status`), inserts `candidate_history` + `audit_events` per candidate.
- `assignCandidateToProject` rejects a cancelled project.
- `$projectId.tsx`: new `AllEmployeesTab` — roster built from current candidates with status in Mobilisation set/On Site/R&R plus candidates resolved from `assignments` for this project whose `final_status`/`end_reason` indicates EOC; stage derived from current status or "EOC"; xlsx export via the existing `xlsx` helper pattern used in Travel Batches.
- `ProjectDocuments` / `CandidateDocumentsRow` candidate list switches from `current_project_id === projectId` to the union with assignment-history candidates; `downloadProjectDocumentsZip` uses the same union server-side.
