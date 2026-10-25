# Opportunities representation update

## Scope
The homepage opportunities section now introduces four pathways with individual cards. A new /opportunities/ hub connects Fellowship, Calls for Papers, Volunteer Opportunities and Foreign Africa Enterprise Week overview pages. Existing slugs are preserved, including /foreign-africa-enterprise-week-few-2/; /foreign-africa-enterprise-week-few/ is also supported as an alias. Remote Internship Programme information remains on its separate original programme page.

## Content and availability
The introductions and thematic focus areas adapt these published overview pages, reviewed on 25 October 2026:
- https://foreignafrica.org/fellowships/
- https://foreignafrica.org/calls-for-papers/
- https://foreignafrica.org/volunteer-opportunities/
- https://foreignafrica.org/foreign-africa-enterprise-week-few-2/

The source pages provide programme descriptions but no specific fellowship call, submission brief, volunteer role or FEW edition dates/registration. The implementation describes that missing information at the page level. It does not claim applications are open or closed, invent eligibility, offer a scholarship, promise a scheduled event, create a role or guarantee publication. Future-announcement checklists are general guidance on details to look for, not confirmed programme requirements.

Copy, page headings and summaries are editorial adaptations. The generic Ideas/Skills/Connections illustration is decorative; it does not represent quantitative data, an approved framework, programme outcomes or a real event. No new photographs, fabricated event images or invented impact statistics are used.

## Visitor experience
- Hub: pathway cards, current-information note, native disclosure FAQs and links to existing research/people pages.
- Detail pages: overview, audience introduction, thematic focus areas, status panel, email enquiry, announcement checklist and related pathways.
- Homepage: four concise cards plus links to the hub and separate Remote Internship Programme.
- Shared navigation: all four pathways plus the hub, FEW under Programmes, and a direct Opportunities footer link.
- Discovery: local destinations and conservative opportunity notices. No opportunity availability is marked verified.

Every enquiry link is a mailto link with a pathway-specific subject addressed to info@foreignafrica.org. It opens an editable draft in the visitor’s email app. There is no form submission, automatic sending, interest database, mailing-list subscription, application collection or fake success state.

## Content model and future publishing
`src/pages/opportunities-content.js` contains the four pathway models and FAQs. Each has listingState='overview'. Source URLs are retained. Add real calls/roles/editions as separate approved records when supplied, with dates, requirements and the genuine application or registration destination. Their publication will require a further UI/CMS change; this update does not connect an editor dashboard or database.

The app routes and homepage share the same pathway data. Related cards use the same canonical paths, enquiry subjects and overview content. Global resource order preserves existing discovery source identifiers, including fa-7 for Remote Internship Programme. The new FEW resource is appended.

## Validation
All 37 Node tests pass, including canonical/legacy routes, email subjects/destinations, navigation coverage and discovery’s unverified availability handling. The production build and whitespace checks pass. Browser review covered the hub, Enterprise Week overview, homepage cards, native FAQ disclosure, mobile section navigation, 390px hub layout and 320px Enterprise Week/Volunteer layouts. Email destinations were inspected without sending any message. No GitHub push or deployment was performed.
