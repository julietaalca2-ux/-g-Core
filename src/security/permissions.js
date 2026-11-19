// Roles y permisos de ÖG Core. El rol se lee SIEMPRE de la base de datos (no del token), así un cambio de rol es inmediato.
export const ROLES = Object.freeze(['owner', 'admin', 'user']);
export const ASSIGNABLE_ROLES = Object.freeze(['admin', 'user']); // 'owner' solo se crea por /auth/setup (único, protegido por índice)

export const PERMISSIONS = Object.freeze({
  owner: Object.freeze(['audit:read', 'users:read', 'users:suspend', 'users:delete', 'users:role']),
  admin: Object.freeze(['audit:read', 'users:read', 'users:suspend', 'users:delete']),
  user: Object.freeze([])
});

export const hasPermission = (role, permission) => (PERMISSIONS[role] ?? []).includes(permission);

/**
 * ¿Puede `actor` ejecutar una acción administrativa sobre `target`?
 * - Nadie administra al propietario ni a sí mismo por la vía administrativa (para eso existen los endpoints de cuenta propia).
 * - El propietario administra a admin y user; un admin solo administra a user.
 */
export function canManageUser(actor, target) {
  if (!actor || !target || actor.id === target.id) return false;
  if (target.role === 'owner') return false;
  if (actor.role === 'owner') return true;
  return actor.role === 'admin' && target.role === 'user';
}
