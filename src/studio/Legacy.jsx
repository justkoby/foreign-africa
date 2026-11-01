import React from 'react';
import {LegacyWorkspace} from '../admin/AdminApp.jsx';

export default function Legacy({section, id, editable}) {
  return <>
    <p className="studio-hint" role="note">{editable ? 'These collections are saved as files in the project and are bundled into the public site when it is built.' : 'These collections are read-only on this server. They are saved as files and bundled into the public site when it is built, so changes belong in a development copy and a new deployment.'}</p>
    <LegacyWorkspace section={section} id={id}/>
  </>;
}
