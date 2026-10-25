# Engage section update

## Routes and content
The existing Engage items now resolve locally:
- /partner-with-us/
- /sponsor-a-programme/
- /book-a-speaker/
- /careers/
- /contact/

An /engage/ overview introduces the three collaboration routes and links to Careers and Contact. Header, footer, homepage/inner-page CTAs and the shared page() helper point to the local pages. Existing unrelated programme destinations retain their original URLs.

Partnership, sponsorship, speaker and contact copy adapts the matching public Foreign Africa pages, reviewed 25 October 2026. Partner copy was retrieved through the WordPress pages endpoint when web retrieval failed. Sponsorship describes an enquiry: no packages, prices, payment promises, benefits or donation checkout have been invented. Speaker requests start a conversation, not a confirmed booking; no fees or guaranteed availability are implied. The institutional-engagement photograph is an existing site asset with a general caption, not a testimonial or a photograph of a new agreement.

## Contact details
Published departmental emails are preserved exactly, including the differing Microsoft domain spellings:
- General: info@foreignafrica.org
- Institutional & Strategic Engagement: founder@foreignafricalgb.onmicrosoft.com
- Partnerships & Operations: operations@foreignafrica.lgb.onmicrosoft.com and abla@foreignafrica.lgb.onmicrosoft.com

No source address has been silently corrected. No telephone number, physical address, response time, office location, social profile or office hours have been invented.

## Enquiry composer
/contact/?topic=partnership|sponsorship|speaker|careers#enquiry preselects the relevant topic. Unknown topics fall back to General. Name, email, optional organisation and message are composed in browser memory only; there is no persistence, application upload or backend request. The message is limited to 1200 characters in the UI.

Open email draft launches a mailto draft addressed to info@foreignafrica.org with encoded subject/body. The visitor must review and send from their own email app. It does not send a message or show a received/submitted confirmation. Copy enquiry validates the fields and copies the draft to the clipboard only after the visitor clicks; an honest error message is shown if clipboard access fails. Direct departmental email links remain available. The mailto handoff itself was not launched during QA, so installed email-client behaviour is not verified.

No personal form data enters Smart Discovery, local storage, analytics or CMS content. Browser checks used dummy data and the Copy action only. No email was sent.

## Careers source finding
The live Careers search returned Institutional Partnerships Officer (IPO), marked Anywhere and Full Time. Its linked detail page at https://foreignafrica.org/?post_type=job_listing&p=7310 explicitly displayed “This listing has expired.” on 25 October 2026. The rebuilt page therefore shows it as a previous expired listing with no application CTA, and no active vacancy in the bundled snapshot. It does not fabricate a role description, salary, deadline or remote-work conditions. The original link is retained for provenance; preserve or redirect legacy job URLs before a WordPress cutover.

## Cursor CMS extension
The forms contract now contains ten purposes (including the subsequent internship_application extension). Added to the earlier fellowship/paper/volunteer/event scope: partnership_enquiry, sponsorship_enquiry, speaker_request, general_enquiry and job_application. Owner types now also include engagement and vacancy. The updated docs/cms-handoff.md and docs/cursor-cms-forms-spec.md are the authoritative build instructions; cms/form-definition.schema.json is the machine-readable field-builder contract.

Cursor must implement private review queues, approved recipients, immutable form versions, server validation, retention/access controls and genuine receipt acknowledgement. Job applications must attach only to a published active vacancy; expired roles reject submissions. A speaker request is not a booking and a sponsorship enquiry is not a payment or pledge. The current email-draft composer must be deliberately replaced when a real endpoint is ready. No schema migration, database or email provider has been connected by this update.

## Validation
All 45 tests pass, including local routes/shared CTA behaviour, exact public email addresses, safe mailto encoding/topic fallback, validation and the expired role state. The production build and whitespace checks pass. Browser review covered Engage, speaker-to-contact topic handoff, invalid/valid Copy behaviour with dummy data, Careers, 390px overview and 320px sponsorship/contact layouts. Long public email links were checked for overflow. Nothing has been pushed or deployed.
