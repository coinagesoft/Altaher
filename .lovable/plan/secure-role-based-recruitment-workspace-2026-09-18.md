# Secure role-based recruitment workspace

## What will be built
- Add email/password sign-in for staff accounts, with no public registration.
- Keep the public `/` page as a sign-in entry point and place the working system behind protected access.
- Store only account-to-role assignments, as requested; no separate staff profile records.
- Let Admin create staff accounts and assign one of the five approved roles.

## Role-specific screens
- **Data Entry:** Candidate Database.
- **Recruiter:** Candidate Database in read-only mode and Project Assignment.
- **Project Coordinator:** Interview & Selection and a separate On Site Roster for R&R/EOC.
- **Mobilisation Executive:** Mobilisation for Medical, Visa, and Mobilisation stages.
- **Admin:** every operational screen, Audit Trail, Reports, and Settings.

## Enforcement and audit
- Protect the workspace before it renders and derive the active role from the signed-in account; remove the role switcher.
- Enforce candidate visibility and every permitted status transition in the database and authenticated server actions, not only in menus.
- Make remarks append-only and record status changes and document events with the signed-in account and timestamp.
- Prevent staff from changing their own role; only Admin can create accounts and assign roles.

## Data and validation
- Persist candidates, projects, remarks, document records, and audit history in Lovable Cloud with least-privilege access rules.
- Include the existing six candidate records as initial workspace data.
- Validate sign-in, sign-out, protected navigation, role-specific menus, denied actions, and desktop/mobile layouts.
