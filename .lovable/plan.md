# Exam Batch Improvements — Implementation Plan

Four focused changes across the exam-batch module. All work stays inside `src/components/exam-batch/`, `src/lib/exam-batch/`, and the leaderboard/take routes.

## 1. Result page (post-submission summary)

Edit the submission summary in `src/components/exam-batch/exam-interface.tsx` to render a single, consistent stat card with:

- Total Questions, Attempted, Correct, Wrong, Unanswered
- Score, Percentage, Time Taken
- Rank block that is conditional on exam close time

Rank behavior:
- Read `endsAt` / `status` from the exam already loaded in the interface.
- If `now < endsAt` (exam still running / open): show "Rank will be available after the exam ends." No rank fetch.
- If exam has ended: fetch rank via existing `student-results.functions.ts` (add a small `getExamRank` server fn if not present) and display it. Auto-refresh once the countdown crosses the end time (interval + `queryClient.invalidateQueries`).

## 2. Back button on result screen

- Add a prominent "Back to Exam Batch" button on the result view.
- Navigates to `/exam-batch/dashboard` (or `/exam-batch`) via `useNavigate`.
- The take-exam route (`_student.exam-batch-take.tsx`) already blocks re-entry once submitted through the existing session state; verify and, if needed, add a guard in the loader/component that redirects submitted attempts straight to the result summary — never back into the question UI.
- Disable/hide "Submit"/answer-mutation actions once `submittedAt` is set.

## 3. Batch leaderboard — student name

Root cause is in the leaderboard query joins (missing `profiles.display_name` / `full_name` projection or a broken FK alias). Fix in `src/lib/exam-batch/admin-results.functions.ts` (admin leaderboard) and `student-results.functions.ts` (student leaderboard):

- Join `exam_batch_enrollments` (or attempts) to `profiles` on `user_id` and select `display_name`, `full_name`, `student_code`/`roll_no`.
- Return `{ studentName, studentId, ... }` in the row type in `results.types.ts`.
- Update leaderboard tables in `admin-pages.tsx` / student leaderboard route to render Name (+ ID underneath or in a second column).
- Update exporters in `admin-exports.functions.ts` and `demo-leaderboard-pdf.ts` so PDF **and** TXT rows include the resolved student name; fall back to email prefix only when name is truly null.

## 4. PDF export color picker

- Add a small `LeaderboardPdfColorDialog` component (uses existing `Dialog` + swatches from `pdf-themes.ts`).
- Wire it into the admin leaderboard "Download PDF" button in `admin-pages.tsx`: click opens dialog → user picks a theme → confirm triggers the existing export server fn with the chosen `themeKey`.
- Extend `admin-exports.functions.ts` (PDF generator) to accept `themeKey` and apply it to header bar, title, alternating row highlight, and footer accents. TXT export unchanged.
- Persist the last choice in `sessionStorage` under `exam-batch.pdfTheme` and preselect it next time.

## Acceptance verification

- Manual: submit an exam while it's still open → see message, no rank; after end time → rank appears on refresh/auto-refetch.
- Back button returns to dashboard; direct URL to a submitted attempt shows result, not questions.
- Leaderboard rows show name (+ ID); export a PDF and TXT and confirm names are present.
- PDF color dialog: pick two different themes, confirm colors change in the generated file.

## Technical notes

- No schema changes. Only query projection + client wiring.
- Reuse `pdf-themes.ts` palette; extend if fewer than 4 themes exist.
- Keep all server-only imports (`pdf-lib`, `jspdf`) inside `.handler()` bodies of `createServerFn` per the import graph rules.
- Add missing `errorComponent`/`notFoundComponent` only if a touched route lacks them; do not restructure routing.
