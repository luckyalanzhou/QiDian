const clone = value => value === undefined ? undefined : structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const conflict = () => { throw new Error('此内容在多台设备上同时修改'); };

function editSpan(base, changed) {
  let start = 0;
  while (start < base.length && start < changed.length && base[start] === changed[start]) start++;
  const isHigh = code => code >= 0xd800 && code <= 0xdbff;
  const isLow = code => code >= 0xdc00 && code <= 0xdfff;
  if (start > 0 && start < base.length && start < changed.length &&
      isHigh(base.charCodeAt(start - 1)) && isLow(base.charCodeAt(start)) &&
      isHigh(changed.charCodeAt(start - 1)) && isLow(changed.charCodeAt(start))) start--;
  let baseEnd = base.length, changedEnd = changed.length;
  while (baseEnd > start && changedEnd > start && base[baseEnd - 1] === changed[changedEnd - 1]) {
    baseEnd--; changedEnd--;
  }
  if (baseEnd > start && changedEnd > start && baseEnd < base.length && changedEnd < changed.length &&
      isLow(base.charCodeAt(baseEnd)) && isLow(changed.charCodeAt(changedEnd)) &&
      isHigh(base.charCodeAt(baseEnd - 1)) && isHigh(changed.charCodeAt(changedEnd - 1))) {
    baseEnd--; changedEnd--;
  }
  return { start, end: baseEnd, replacement: changed.slice(start, changedEnd) };
}

function mergeIndependentTextEdits(base, local, remote) {
  if (local === remote) return local;
  const left = editSpan(base, local), right = editSpan(base, remote);
  const leftInsert = left.start === left.end, rightInsert = right.start === right.end;
  const disjoint = leftInsert
    ? left.start < right.start || left.start > right.end
    : rightInsert
      ? right.start < left.start || right.start > left.end
      : left.end <= right.start || right.end <= left.start;
  if (!disjoint) return null;
  return [left, right].sort((a, b) => b.start - a.start).reduce(
    (result, edit) => result.slice(0, edit.start) + edit.replacement + result.slice(edit.end), base
  );
}

function mergeRecord(base, local, remote, path) {
  if (same(local, base)) return clone(remote);
  if (same(remote, base) || same(local, remote)) return clone(local);
  if (path === 'note.body' && typeof base === 'string' && typeof local === 'string' && typeof remote === 'string') {
    const merged = mergeIndependentTextEdits(base, local, remote);
    return merged === null ? conflict() : merged;
  }
  if (!isRecord(local) || !isRecord(remote) || (base !== undefined && !isRecord(base))) return conflict();
  const result = {}, keys = new Set([...Object.keys(base || {}), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    if (key === 'updated' && path === 'note') {
      result[key] = Math.max(Number(local[key] || 0), Number(remote[key] || 0));
      continue;
    }
    const value = mergeRecord(base?.[key], local[key], remote[key], `${path}.${key}`);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function mergeRecords(base = [], local = [], remote = [], keyOf = value => value.id, label = '内容') {
  if (same(local, base)) return clone(remote);
  if (same(remote, base) || same(local, remote)) return clone(local);
  if (![base, local, remote].every(Array.isArray)) return conflict();
  const baseMap = new Map(base.map(item => [keyOf(item), item]));
  const localMap = new Map(local.map(item => [keyOf(item), item]));
  const remoteMap = new Map(remote.map(item => [keyOf(item), item]));
  const values = new Map();
  for (const id of new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()])) {
    const b = baseMap.get(id), l = localMap.get(id), r = remoteMap.get(id);
    if (l === undefined || r === undefined) {
      if (l === undefined && r === undefined) continue;
      if (l === undefined && b === undefined) { values.set(id, clone(r)); continue; }
      if (r === undefined && b === undefined) { values.set(id, clone(l)); continue; }
      if (l === undefined && same(r, b)) continue;
      if (r === undefined && same(l, b)) continue;
      return conflict();
    }
    values.set(id, mergeRecord(b, l, r, label));
  }
  const baseOrder = base.map(keyOf).filter(id => values.has(id));
  const localOrder = local.map(keyOf).filter(id => values.has(id));
  const remoteOrder = remote.map(keyOf).filter(id => values.has(id));
  const localBaseOrder = localOrder.filter(id => baseOrder.includes(id));
  const remoteBaseOrder = remoteOrder.filter(id => baseOrder.includes(id));
  const localReordered = !same(localBaseOrder, baseOrder.filter(id => localBaseOrder.includes(id)));
  const remoteReordered = !same(remoteBaseOrder, baseOrder.filter(id => remoteBaseOrder.includes(id)));
  if (localReordered && remoteReordered && !same(localBaseOrder, remoteBaseOrder)) return conflict();
  const preferred = localReordered ? localOrder : remoteReordered ? remoteOrder : baseOrder;
  const order = [...preferred, ...localOrder, ...remoteOrder, ...values.keys()];
  const seen = new Set();
  return order.filter(id => values.has(id) && !seen.has(id) && seen.add(id)).map(id => values.get(id));
}

export function mergeVault(base, local, remote) {
  if (!base || !local || !remote) return null;
  try {
    const merged = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
      if (key === 'notes') merged.notes = mergeRecords(base.notes || [], local.notes || [], remote.notes || [], value => value.id, 'note');
      else if (key === 'noteTypes') merged.noteTypes = mergeRecords(base.noteTypes || [], local.noteTypes || [], remote.noteTypes || [], value => value.id, 'type');
      else if (key === 'categories') merged.categories = mergeRecords(base.categories || [], local.categories || [], remote.categories || [], value => value, 'category');
      else if (key === 'bookmarks') merged.bookmarks = mergeRecords(base.bookmarks || [], local.bookmarks || [], remote.bookmarks || [], value => value.id, 'bookmark');
      else {
        const value = mergeRecord(base[key], local[key], remote[key], key);
        if (value !== undefined) merged[key] = value;
      }
    }
    return merged;
  } catch {
    return null;
  }
}
