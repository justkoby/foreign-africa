export const storyUrl=id=>`/?story=${encodeURIComponent(id)}`;
export const photos={
 addis:{src:'/images/activities/addis-original.png',alt:'Two representatives photographed during Foreign Africa’s Addis Ababa institutional engagement mission.',panel:1,position:'center 24%'},
 kigali:{src:'/images/activities/kigali-original.png',alt:'Three representatives during the Kigali leg of Foreign Africa’s continental engagement mission.',panel:0.554,position:'center 52%'},
 startup:{src:'/images/activities/startup-haus-original.png',alt:'Four representatives at Westerwelle Startup Haus Kigali, with the hub’s signage visible.',panel:0.528,position:'center 45%'},
 commission:{src:'/images/activities/high-commission-original.png',alt:'Four representatives photographed between Rwanda and Ghana flags during the Kigali engagement mission.',panel:0.548,position:'center 55%'},
 edws:{src:'/images/activities/edws-four-original.png',alt:'EDWS Session 4 announcement: Beyond the Logo, featuring Dr. Temitope Falade and facilitator Hildana Mesai, 9 October 2026.',panel:0.563,position:'center'},
 cohort:{src:'/images/activities/cohort-original.png',alt:'2026 cohort completion ceremony announcement scheduled for 23 October 2026 at 10:30 on Microsoft Teams.',panel:1,position:'center'},
};
export const activities=[
 {id:'continental-mission-follow-up',title:'From continental engagement to practical workstreams',category:'Mission report',date:'2026-09-02',displayDate:'2 September 2026',location:'Addis Ababa & Kigali',topics:['mission','Ethiopia','Rwanda','diplomacy','enterprise','policy'],photo:{src:'/images/activities/embassy-group.webp',alt:'Four representatives at the Ghana Embassy during Foreign Africa’s Ethiopia mission.',position:'center'},sourceUrl:'https://foreignafrica.org/foreign-africa-concludes-ethiopia-and-rwanda-mission-enters-90-day-follow-up-phase/',sourceFiles:['Published Foreign Africa mission report, 2 September 2026'],imageCaption:'Original photograph supplied with the published mission report.',summary:'Following its Ethiopia and Rwanda mission, Foreign Africa has entered a structured 90-day phase to turn priority conversations into research, pilot activities and institutional workstreams.',paragraphs:[
 'Foreign Africa has concluded its Continental Institutional Engagement Mission to Addis Ababa, Ethiopia, and Kigali, Rwanda. Led by Founder and Head of Global Engagement Elorm Mawuli-Kwawu, the August 2026 mission connected diplomacy and continental policy with research, higher education and enterprise development.',
 'In Addis Ababa, discussions with the Embassy of Ghana explored policy research supporting Ghana’s continental diplomatic engagement. At the African Union Commission’s Department of Economic Development, Tourism, Trade, Industry and Minerals (ETTIM), dialogue covered trade, industrialisation, enterprise development and regional integration, including a prospective AU-related engagement in January 2027.',
 'Engagement with UNDP Africa identified alignment around the Africa Trade and Jobs Tracker, Junior Associates Programme, Enterprise Development Workshop Series and Timbuktoo Initiative. Discussions with the Institute for Security Studies explored regional integration, governance, municipal diplomacy and entrepreneurial diplomacy.',
 'In Kigali, African Leadership University and its Centre for Entrepreneurial Leadership identified potential collaboration on youth employment, applied research, enterprise development and the Africa Trade and Jobs Tracker. ALU requested a formal proposal setting out specific areas for institutional collaboration.',
 'Foreign Africa also engaged Westerwelle Startup Haus Kigali on founder development and connections to Accra. The Ghana High Commission provided diplomatic and institutional guidance. A channel was opened for formal engagement with Rwanda Development Board, alongside initial contact with Norrsken House Kigali.',
 'The structured 90-day follow-up phase focuses on converting priority engagements into defined workstreams, research outputs, pilot activities and longer-term relationships. Initial engagements, identified opportunities, agreed actions and formal partnerships remain distinct stages.'
 ]},
 {id:'johannesburg-convening',title:'Building academic connections in Johannesburg',category:'News',date:'2026-02-01',displayDate:'1 February 2026',location:'Johannesburg, South Africa',topics:['higher education','research','partnerships','Education Collaborative'],photo:{src:'/images/activities/johannesburg-convening.webp',alt:'Participants at The Education Collaborative’s Southern Africa Hub Convening in Johannesburg.'},gallery:[{src:'/images/activities/johannesburg-delegates.webp',alt:'Delegates pictured at The Education Collaborative convening.'},{src:'/images/activities/elorm-johannesburg.webp',alt:'Elorm Mawuli-Kwawu pictured at The Education Collaborative convening.'}],sourceUrl:'https://foreignafrica.org/foreign-africa-participates-in-the-education-collaboratives-southern-african-convening-in-johannesburg/',sourceFiles:['Published Foreign Africa Johannesburg report, 1 February 2026'],imageCaption:'Original group photograph from the Southern Africa Hub Convening. Article published 1 February 2026; the event backdrop dates the convening to 14–16 January 2026.',summary:'Foreign Africa joined university leaders, practitioners and partners at The Education Collaborative’s inaugural Southern African Convening.',paragraphs:[
 'Foreign Africa began its working year with an engagement in Johannesburg at The Education Collaborative’s inaugural Southern African Convening, bringing together university leaders, practitioners and partners focused on research development and social impact.',
 'The organisation was represented by its Head of Global Engagements, Board Chair Professor De Brenna, Provost and Vice President of Academic Affairs at the University of Grand-Bassam in Côte d’Ivoire, and Abla, Programmes and Partnerships Lead.',
 'The convening offered a platform for exchanging ideas, building relationships and exploring collaboration on research, programme development and institutional partnerships. This participation forms part of Foreign Africa’s effort to strengthen academic networks across the continent.'
 ]},

 {id:'edws-in-numbers',title:'474 registrations. 25 countries. Four workshops.',category:'Programme update',date:'2026-10-15',displayDate:'15 October 2026',location:'Across Africa',topics:['enterprise','learning','research'],photo:photos.startup,
  summary:'A registration snapshot from the first four Enterprise Development Workshop Series sessions shows demand for practical enterprise skills.',
  paragraphs:[
   'Foreign Africa’s published EDWS registration snapshot reports 474 registrations across the first four sessions, with 25 countries represented and 2,567 registration-page views.',
   'These figures describe registrations and page views. They do not establish unique participants, attendance, completion rates or jobs created.',
   'Among registrants who shared their business stage, 70% were at the idea or early stage. The snapshot also reports that 47 of 67 Session 4 registrants had not yet engaged investors, donors or government.',
   'The findings point to a practical need for enterprise skills, structure and access to institutional and funding networks.'
  ],sourceFiles:['Screenshot 2026-10-25 023244.png','Screenshot 2026-10-25 023254.png','Screenshot 2026-10-25 023303.png','Screenshot 2026-10-25 023322.png'],
  imageCaption:'Westerwelle Startup Haus Kigali engagement photograph. This image illustrates Foreign Africa’s enterprise work; it is not a photograph of an EDWS workshop.',related:'https://foreignafrica.org/enterprise-development-workshop-series-edws/'},
 {id:'kigali-engagement',title:'Connecting policy, talent and enterprise in Kigali',category:'Institutional engagement',date:'2026-08-27',displayDate:'27 August 2026',location:'Kigali, Rwanda',topics:['enterprise','diplomacy','learning'],photo:photos.kigali,gallery:[photos.startup,photos.commission],
  summary:'The Kigali mission brought discussions with entrepreneurship hubs, diplomatic networks and higher education into one programme of engagement.',
  paragraphs:[
   'Foreign Africa’s Kigali mission update describes engagement across higher education, entrepreneurship hubs and diplomatic institutions as part of its Continental Institutional Engagement Mission.',
   'At Westerwelle Startup Haus Kigali, the focus included founder networks, mentorship and enterprise ecosystems, with discussion of pathways connecting to Accra.',
   'The update also identifies engagement with the Ghana High Commission in Kigali on economic diplomacy and institutional access, and with African Leadership University on the Junior Associates Programme and entrepreneurial leadership.',
   'The mission update also names Rwanda Development Board and ecosystem hubs in discussions about future investment, regional integration and trade-driven employment.'
  ],sourceFiles:['Screenshot 2026-10-25 023529.png','Screenshot 2026-10-25 023541.png','Screenshot 2026-10-25 023548.png'],imageCaption:'Photograph supplied with Foreign Africa’s Kigali mission update.'},
 {id:'addis-engagement',title:'Institutional dialogue in Addis Ababa',category:'Institutional engagement',date:'2026-08-14',displayDate:'14 August 2026',location:'Addis Ababa, Ethiopia',topics:['diplomacy','enterprise','trade','jobs'],photo:photos.addis,
  summary:'Foreign Africa’s Addis Ababa update outlines discussions with UNDP Africa around trade, enterprise development and opportunities for junior associates.',
  paragraphs:[
   'The Addis Ababa phase of Foreign Africa’s Continental Institutional Engagement Mission included reported engagement with Barbara Asamoah and the UNDP Africa Region Office team.',
   'Foreign Africa’s update identifies four pathways for prospective collaboration: the Africa Trade and Jobs Tracker, the Timbuktoo Project, the Junior Associates Programme and the Enterprise Development Workshop Series.',
   'The post also describes a prospective pathway for Junior Associates to access UNDP’s Senior Fellows Programme. It does not establish an open application call or guarantee eligibility or placement.',
   'The mission connects Foreign Africa’s focus on trade, policy and enterprise with institutional dialogue, bringing its programmes into conversations about Africa’s economic development.'
  ],sourceFiles:['Screenshot 2026-10-25 023614.png','Screenshot 2026-10-25 023619.png','Screenshot 2026-10-25 023623.png'],imageCaption:'Photograph supplied with Foreign Africa’s Addis Ababa mission update.'},
 {id:'beyond-the-logo',title:'Beyond the Logo: Building Brands Investors and Governments Trust',category:'Past workshop',date:'2026-10-09',displayDate:'9 October 2026',location:'Online · Microsoft Teams',topics:['enterprise','learning'],photo:photos.edws,
  summary:'EDWS Session 4 focused on the relationship between brand credibility, investor confidence and institutional trust.',
  paragraphs:[
   'Foreign Africa’s Session 4 announcement scheduled “Beyond the Logo: Building Brands Investors and Governments Trust” for 9 October 2026, from 3:00 to 4:30 PM GMT on Microsoft Teams.',
   'The announcement named Dr. Temitope Falade as speaker and Hildana Mesai as facilitator. The speaker spotlight introduced Dr. Falade as Head of Brands, Communications and Marketing at Pan-Atlantic University, Lagos.',
   'The stated themes included executive communications, reputation and crisis management, brand governance, digital engagement and storytelling that builds stakeholder trust.',
   'The announced session brought brand credibility and institutional trust into EDWS’s practical enterprise-learning agenda.'
  ],sourceFiles:['Screenshot 2026-10-25 023407.png','Screenshot 2026-10-25 023419.png'],imageCaption:'Original Session 4 announcement. The registration date has passed.'},
 {id:'cohort-completion',title:'A milestone for the 2026 cohort',category:'Cohort announcement',date:'2026-10-23',displayDate:'23 October 2026',location:'Online · Microsoft Teams',topics:['internship','learning'],photo:photos.cohort,
  summary:'Foreign Africa announced a completion ceremony recognising the achievements and work of its 2026 cohort.',
  paragraphs:[
   'The 2026 cohort completion ceremony announcement invited the community to recognise the achievements and work of Foreign Africa’s associates.',
   'The announcement scheduled the ceremony for Friday, 23 October 2026 at 10:30 on Microsoft Teams, with Prof. Debrenna Agbényiga, Chairperson of Foreign Africa’s Advisory Council, listed as guest speaker.'
  ],sourceFiles:['Screenshot 2026-10-25 023217.png'],imageCaption:'Original completion ceremony announcement for the 2026 cohort.'},
];
export const edwsMetrics=[{value:'474',label:'registrations'},{value:'25',label:'countries represented'},{value:'4',label:'workshops delivered'},{value:'2,567',label:'registration-page views'}];
export const getStory=id=>activities.find(s=>s.id===id);
