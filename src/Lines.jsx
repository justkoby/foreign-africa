import React from 'react';
// Renders heading lines separated by <br/>, matching the markup the page used when the text was inline.
export default function Lines({lines}){return lines.map((line,i)=><React.Fragment key={i}>{line}{i<lines.length-1&&<br/>}</React.Fragment>)}
