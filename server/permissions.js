export const roles = ['super_admin', 'admin', 'editor', 'contributor'];

const grants = {
  super_admin: ['content.read', 'content.create', 'content.update.any', 'content.publish', 'content.delete', 'users.read', 'users.manage', 'users.assign_super', 'activity.read', 'health.read', 'settings.read', 'legacy.edit', 'submissions.read', 'submissions.manage', 'submissions.export'],
  admin: ['content.read', 'content.create', 'content.update.any', 'content.publish', 'content.delete', 'users.read', 'users.manage', 'activity.read', 'health.read', 'legacy.edit', 'submissions.read', 'submissions.manage', 'submissions.export'],
  editor: ['content.read', 'content.create', 'content.update.any', 'content.publish', 'legacy.edit'],
  contributor: ['content.read', 'content.create', 'content.update.own'],
};

export function permissionsFor(roleKeys) {
  return new Set(roleKeys.flatMap(role => grants[role] ?? []));
}

export function allows(roleKeys, permission) {
  return permissionsFor(roleKeys).has(permission);
}

export function primaryRole(roleKeys) {
  return roles.find(role => roleKeys.includes(role)) ?? '';
}
