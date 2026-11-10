export const pocketCounts = [4, 9];
export const maxSpreads = 300;

export function emptyBinder() {
  return { size: 9, layouts: { 4: Array(8).fill(null), 9: Array(18).fill(null) } };
}

export function validateBinder(binder, isVariant) {
  if (!pocketCounts.includes(binder?.size) || !binder.layouts)
    throw new Error('Choose a valid binder layout.');
  const layouts = {};
  for (const size of pocketCounts) {
    const slots = binder.layouts[size];
    const spread = size * 2;
    if (
      !Array.isArray(slots) ||
      slots.length < spread ||
      slots.length > maxSpreads * spread ||
      slots.length % spread
    )
      throw new Error('Choose a valid number of binder pages.');
    const occupied = slots.filter((id) => id !== null);
    if (new Set(occupied).size !== occupied.length || !occupied.every(isVariant))
      throw new Error('Place each collection card once per binder layout.');
    layouts[size] = slots;
  }
  return { size: binder.size, layouts };
}

export function pruneBinder(binder, variantIds) {
  if (!binder) return binder;
  const members = new Set(variantIds);
  const layouts = {};
  let changed = false;
  for (const size of pocketCounts)
    layouts[size] = binder.layouts[size].map((id) => {
      if (id === null || members.has(id)) return id;
      changed = true;
      return null;
    });
  return changed ? { ...binder, layouts } : binder;
}

export const sameBinder = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
