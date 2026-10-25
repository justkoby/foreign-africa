export const policyBriefs = [
  {
    id:'the-wrong-indicator',issue:'002',date:'September 2026',datetime:'2026-09',pages:7,topic:'Employment & development',
    title:'The Wrong Indicator: How Africa Measures Work and Misses Poverty',
    summary:'A job is only the beginning of the story. This brief examines why employment rates can conceal working poverty, and what policymakers should measure alongside them.',
    takeaways:['Look beyond the employment rate to the quality, productivity and income of work.','Report working poverty alongside headline labour-market figures.','Track market integration to better understand how agricultural work supports household incomes.'],
    note:'The analysis compares 43 Sub-Saharan African countries using observations from 2016–2025. Its country-level findings describe associations, not causation.',
  },
  {
    id:'reparatory-justice',issue:'001',date:'July 2026',datetime:'2026-07',pages:10,topic:'Diplomacy & reparatory justice',
    title:'From UNGA Resolution A/80/L.48 to Implementation: The African Union and the Future of Reparatory Justice',
    summary:'Moving from recognition to implementation. This brief examines Reliefs 10–14 and the legal, institutional and accountability mechanisms for pursuing reparatory justice.',
    takeaways:['Examine the operational architecture behind the resolution’s recognition of historical injustice.','Connect institutional coordination, tangible redress and accountability.','Assess the political will and institutional capacity needed for implementation.'],
    note:'The brief argues that the resolution establishes an architecture for pursuing reparatory justice; implementation depends on political will and institutional capability.',
  },
].map(brief=>({...brief,base:`/documents/policy-briefs/${brief.id}`,url:`/policy-briefs/#brief-${brief.issue}`}));
