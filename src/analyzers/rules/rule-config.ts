import type { MigrationRule } from './rule-types';

export function validateMappings(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('componentMappings deve ser um objeto.');
  const result: Record<string, string> = {};
  for (const [source, target] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9-]*$/.test(source) || typeof target !== 'string' || !target.trim()) {
      throw new Error(`Mapeamento inválido: ${source}. Use um elemento HTML e um destino não vazio.`);
    }
    result[source] = target;
  }
  return result;
}
export function mappingsToRules(value: unknown): MigrationRule[] {
  return validateRules(Object.entries(validateMappings(value)).sort(([a], [b]) => a.localeCompare(b))
    .map(([source, target]) => ({ id: `${source}->${target}`, type: 'element', source, target, enabled: true })));
}
export function validateRules(value: unknown): MigrationRule[] {
  if (!Array.isArray(value)) throw new Error('migrationRules deve ser uma lista.');
  const ids = new Set<string>();
  return value.map((entry: unknown, index) => {
    const fail = (reason: string): never => { throw new Error(`migrationRules[${index}]: ${reason}`); };
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail('regra deve ser um objeto.');
    const r = entry as Record<string, unknown>;
    const { id, type, source, target, attribute } = r;
    if (typeof id !== 'string' || !id.trim() || ids.has(id)) return fail('id deve ser não vazio e único.');
    ids.add(id);
    if (typeof source !== 'string' || !source.trim()) return fail('source deve ser uma string não vazia.');
    if (typeof target !== 'string' || !target.trim()) return fail('target deve ser uma string não vazia.');
    if (r['enabled'] !== undefined && typeof r['enabled'] !== 'boolean') return fail('enabled deve ser booleano.');
    const enabled = r['enabled'] !== false;
    if (r['priority'] !== undefined && (typeof r['priority'] !== 'number' || !Number.isFinite(r['priority']))) return fail('priority deve ser um número finito.');
    if (r['element'] !== undefined && (typeof r['element'] !== 'string' || !/^[a-zA-Z][\w:.-]*$/.test(r['element']))) return fail('element deve ser uma tag.');
    const targetType = r['targetType'];
    if (targetType !== undefined && (typeof targetType !== 'string' || !['element', 'class', 'attribute', 'attribute-value'].includes(targetType))) return fail('targetType inválido.');
    const targetAttribute = r['targetAttribute'];
    if (targetAttribute !== undefined && (typeof targetAttribute !== 'string' || !targetAttribute || /[\s<>="']/.test(targetAttribute))) return fail('targetAttribute inválido.');
    const effectiveType = targetType ?? type;
    const destinationAttribute = targetAttribute ?? (type === 'attribute-value' ? attribute : undefined);
    if (effectiveType === 'attribute-value' && (typeof destinationAttribute !== 'string' || !destinationAttribute || /[\s<>="']/.test(destinationAttribute))) return fail('destino attribute-value requer targetAttribute válido (ou attribute da origem attribute-value).');
    if (effectiveType === 'element' && !/^[a-zA-Z][\w:.-]*$/.test(target)) return fail('destino element requer uma tag.');
    if (effectiveType === 'class' && /\s/.test(target)) return fail('destino class requer uma única classe.');
    if (effectiveType === 'attribute' && /[\s<>="']/.test(target)) return fail('destino attribute requer nome válido.');
    if (effectiveType === type && (type === 'element' ? source.toLowerCase() === target.toLowerCase() : source === target)
      && (type !== 'attribute-value' || (targetAttribute ?? attribute) === attribute)) return fail('origem e destino devem ser diferentes.');
    const base = { id, source, target, enabled,
      ...(r['priority'] !== undefined ? { priority: r['priority'] as number } : {}),
      ...(r['element'] !== undefined ? { element: r['element'] as string } : {}),
      ...(targetType !== undefined ? { targetType: targetType as MigrationRule['type'] } : {}),
      ...(targetAttribute !== undefined ? { targetAttribute: targetAttribute as string } : {}) };
    switch (type) {
      case 'element':
        if (!/^[a-zA-Z][\w:.-]*$/.test(source)) return fail('element requer um nome de tag.');
        return { ...base, type };
      case 'class':
        if (/\s/.test(source)) return fail('class requer uma única classe.');
        return { ...base, type };
      case 'attribute':
        if (/[\s<>="']/.test(source)) return fail('attribute requer um nome de atributo.');
        return { ...base, type };
      case 'attribute-value':
        if (typeof attribute !== 'string' || !attribute || /[\s<>="']/.test(attribute)) return fail('attribute-value requer attribute válido.');
        return { ...base, type, attribute };
      default: return fail(`tipo não suportado: ${String(type)}.`);
    }
  });
}
export function parseRuleConfig(text: string): MigrationRule[] {
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('.code-insight.json: JSON inválido.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('.code-insight.json deve conter um objeto.');
  return validateRules((value as Record<string, unknown>)['migrationRules']);
}
