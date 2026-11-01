// Tracks whether the open editor has unsaved changes, so in-app navigation can ask before discarding them.
let unsaved = false;
export const setUnsaved = value => { unsaved = Boolean(value); };
export const hasUnsaved = () => unsaved;
export const confirmLeave = () => !unsaved || window.confirm('You have unsaved changes. Leave this page and lose them?');
