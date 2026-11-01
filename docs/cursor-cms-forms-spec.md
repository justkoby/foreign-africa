# Cursor CMS requirement: opportunity applications and event registration

This is required future CMS work, added at the user’s request. It is a build specification and schema contract; no live form endpoint, dashboard, database table, upload bucket or email service has been implemented. Read alongside docs/cms-handoff.md. The current frontend keeps email enquiries until a real form is published and connected.

## Required form types
| Owner | Purpose | Example configurable fields (editor-approved before use) |
| --- | --- | --- |
| Fellowship call | fellowship_application | Name, email, background, research interests, statement, optional CV |
| Internship intake | internship_application | Name, email, background, interests, availability, editor-approved supporting documents |
| Research call | paper_submission | Corresponding author, email, title, abstract, topic, manuscript |
| Volunteer role or interest call | volunteer_interest | Name, email, skills, interests, availability, optional portfolio/CV |
| Event or Enterprise Week edition | event_registration | Name, email, organisation, participation/session choices, accessibility needs if necessary |

These examples are builder capabilities, not confirmed eligibility or mandatory data collection for the present overview pages. Keep forms limited to the information needed for that call. Support a verified HTTPS external form destination as an alternative to a CMS-hosted form; do not embed arbitrary HTML or scripts.

## Engage enquiries and Careers (required extension)
Add these purposes to the same versioned form builder and private review workflow:
- partnership_enquiry: organisation, contact, proposed collaboration, shared objectives and optional proposal attachment.
- sponsorship_enquiry: organisation, programme interest, proposed support and contact details. This is an enquiry, not a payment checkout or pledge.
- speaker_request: host organisation, audience, topic/format, proposed date/time zone, venue/online arrangements and contact. Submission does not confirm a booking or availability.
- general_enquiry: topic, name, email, message and optional organisation.
- job_application: attach only to a published active vacancy, with approved application fields, deadline and private CV/documents. Expired roles must reject applications and lose the application CTA.

Allow ownerType=engagement for the first four and ownerType=vacancy for job applications. Create private enquiry/job review queues with assignments, status, notes and approved recipients. Only acknowledge receipt after persistence succeeds. All earlier privacy, server validation, uploads, RLS, audit and retention rules apply. Prevent public disclosure of proposed partnerships, sponsor details, speaker schedules or applicant data.

The current Contact page is a browser-only email-draft composer: it neither sends an email nor stores a submission. Replace this mode with the genuine CMS form endpoint only when ready; do not leave “Open email draft” copy on a hosted submission form or claim a mailto launch is a received enquiry. Keep departmental recipients/configuration editable and preserve source email addresses until the owner approves changes. Careers currently retains one explicitly expired source role, with no active application destination.

## Admin workflow
1. Create a specific call, role or event edition under the relevant opportunity pathway.
2. Add dates, eligibility/participation details and the genuine application/registration destination.
3. Create or attach a reusable form. Build fields with stable IDs, labels, help text, required flags, limits and approved choices. Preview mobile and desktop using test data.
4. Configure approved privacy text, an unselected consent acknowledgement, opening/closing time with explicit time zone, and success text.
5. Publish the owner and form together after validation. Keep drafts private. Closing or archiving a call, cancelling/passing an event or reaching the deadline must stop acceptance on the server.
6. Review submissions in a separate restricted dashboard with filters, statuses, notes, audit history and authorised export. Editors cannot grant themselves reviewer access.

## Public form definition
The machine-readable contract is cms/form-definition.schema.json. Validate it with JSON Schema draft 2020-12 plus date-time format validation. Also enforce unique field IDs; ordered valid opening/closing times; options only for choice fields with at least one option; meaningful limits; compatible owner/purpose; a required email field when a confirmation is offered; file-type/size declarations for file fields; and approved non-placeholder privacy/consent text before publishing. Published form versions are immutable: create a new version for field or consent changes.

Public definitions contain only visitor-visible schema. Reviewer assignment, notification recipients, retention rules, internal notes and provider settings are private configuration. Never put these into publicly readable content payloads.

## Data model to build
- opportunity_pathways: overview content and stable existing route.
- opportunity_calls: pathway_id, approved title/body, call status, opens_at/closes_at, eligibility and participation metadata, form_id or verified external_url. FEW uses event editions rather than one permanent application window.
- events: publication state, title/slug, summary/body, cover, start_at/end_at, IANA time zone, date-only flag where appropriate, venue/online format, cancelled flag, registration mode, form_id/external_url, optional recording link once verified.
- forms and form_versions: stable ID, owner relation, purpose, versioned field schema and consent text, draft/open/closed/archived state and schedule.
- form_submissions: private ID/reference, form_id, exact form_version, owner_id, answers, consent version/timestamp, submitted_at and review status. Capture the server receipt time; keep the form schema snapshot for interpreting historic answers.
- submission_files: private storage object key, submission_id, field_id, validated MIME/size/hash and upload state.
- submission_reviews and submission_audit: private reviewer decisions, notes and access/export history.

The existing proposed content_items migration supports only news/hero/person/about/recording. Cursor must create reviewed migrations for event and opportunity public content and the separate form/submission tables; the existing SQL must not be mistaken for a completed forms backend. Full model validation belongs at the server boundary, not solely in JSON payloads or the browser.

## Public action behaviour
Current opportunity models have formId=null and actionMode='enquiry'; current event records also have formId=null and unavailable registration. Replace the enquiry action only when the owner and form are published, the acceptance window is valid and the API confirms the form is open. On a past/cancelled event, do not show a registration CTA even if an old destination remains in the source content. Keep editorial publication date separate from event dates.

A hosted form should render the approved field schema with accessible labels, keyboard navigation, field-level errors, upload progress and a submit state that prevents accidental repeat submissions. Preserve answers after a recoverable error. Show a reference and confirmation only after durable storage succeeds. Interest submission is not selection, registration is not a ticket/seat guarantee unless the backend explicitly confirms capacity, and a paper submission is not publication acceptance. No hardcoded “application successful” placeholder.

## Server and access requirements
Use a server endpoint for submission and upload authorisation. Enforce the current owner/form/version/window, required fields, choices, answer types, lengths, file MIME/size/content checks, consent and idempotency server-side. Add rate limits and a spam control appropriate to a public endpoint. Store uploads privately with short-lived authorised access. Do not collect real submissions through a public-write content table or expose files through a public bucket. No service credentials in browser bundles.

Anonymous visitors may read only published public definitions and submit through the controlled endpoint; they cannot list/read/update any submissions. Approved reviewers may access submissions for assigned forms. Administrators manage roles and retention. Apply and test Supabase RLS/storage policies using anonymous, ordinary-user, reviewer and administrator sessions. Persisted submissions and review history must not enter public search, AI directory context, content seed exports or public static files.

Configure retention/deletion and the approved privacy notice before collecting real data. Separate any optional marketing opt-in from the required submission acknowledgement; never preselect it. Keep automated confirmation/reviewer notifications disabled until the service, recipients, templates and delivery/retry handling are approved and configured. This task authorises the specification, not sending messages.

## Cursor acceptance checklist
- An editor can build, preview, publish, version, close and archive all ten form types without changing code.
- A genuine call/edition has a clear status and only an authorised live form changes the public CTA.
- Past/cancelled/deadline-expired owners reject submission even when reached by a stale link or direct API call.
- Required/choice/length/consent/file rules and duplicate-submit handling work server-side.
- An error before storage never shows a success acknowledgement; retries do not create duplicate submissions.
- Draft forms, private answers and uploads are unreadable to anonymous and unrelated signed-in users.
- Reviewers can access only assigned forms, and exports/access/review changes are audited.
- Publication and event dates/time zones remain distinct; event status changes automatically with time.
- Public forms pass keyboard, screen-reader, narrow-mobile and validation-error checks.
