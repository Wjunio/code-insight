import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRules } from '../src/analyzers/rules/migration-rules';
import { mappingsToRules, parseRuleConfig, validateRules } from '../src/analyzers/rules/rule-config';
import type { MigrationRule } from '../src/analyzers/rules/rule-types';
import { AngularProjectAnalyzer } from '../src/analyzers/project-analyzer';
import { RuleEngine } from '../src/analyzers/rules/rule-engine';
import { reportJson, reportText } from '../src/reports/report-generator';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rule = (type: MigrationRule['type'], source: string, extra = {}): MigrationRule =>
  validateRules([{ id: `${type}:${source}`, type, source, target: 'destino-configuravel', ...extra }])[0]!;
function scan(content: string, rules: MigrationRule[]) {
  return analyzeRules([{ file: 'app.html', content }], rules);
}
test('exemplo solicitado: classe, atributo e elemento produzem três ocorrências', () => {
  const rules = [rule('class', 'material-icon'), rule('attribute', 'matInput'), rule('element', 'mat-icon')];
  const results = scan('<a class="material-icon">search</a>\n\n<input matInput>\n\n<mat-icon>home</mat-icon>', rules);
  assert.deepEqual(results.map(r => r.occurrences), [1, 1, 1]);
  assert.deepEqual(results.map(r => r.matches[0]?.line), [1, 3, 5]);
  assert.equal(results.reduce((total, r) => total + r.occurrences, 0), 3);
  assert.deepEqual(results[1]?.matches[0], {
    ruleId: 'attribute:matInput', type: 'attribute', source: 'matInput', target: 'destino-configuravel', file: 'app.html', line: 3, column: 1, status: 'pending'
  });
});
test('classe independe da tag e corresponde a token completo, uma vez por elemento', () => {
  const result = scan(`<a class="other material-icon material-icon"></a><span class='material-icon'></span><div class=material-icon></div>
    <i class="material-icon-extra"></i><i class="other-material-icon"></i><i class="Material-icon"></i>`, [rule('class', 'material-icon')]);
  assert.equal(result[0]?.occurrences, 3);
});
test('atributos booleanos, com valores e multiline preservam case e não usam substring', () => {
  const result = scan(`<input matInput><textarea\n matInput="yes"></textarea><input matInput='no'><input matInputExtra><input matinput><input [matInput]="flag">`, [rule('attribute', 'matInput')]);
  assert.equal(result[0]?.occurrences, 3);
});
test('attribute-value exige nome e valor exatos e suporta espaços no valor', () => {
  const result = scan(`<div data-component="legacy-icon"></div><span data-component='legacy-icon'></span><i data-component=legacy-icon></i>
    <div data-other="legacy-icon"></div><div data-component="legacy-icon extra"></div><div data-component></div>`, [rule('attribute-value', 'legacy-icon', { attribute: 'data-component' })]);
  assert.equal(result[0]?.occurrences, 3);
  assert.equal(result[0]?.matches[0]?.attribute, 'data-component');
  assert.equal(scan('<div title="old icon">', [rule('attribute-value', 'old icon', { attribute: 'title' })])[0]?.occurrences, 1);
});
test('destino é configurável; a regra mais específica vence sobreposições', () => {
  const result = scan('<input class="old" matInput>', [
    rule('element', 'input', { id: 'one', target: 'meu-input' }),
    rule('element', 'input', { id: 'two', target: 'componente-x' }),
    rule('class', 'old', { target: 'destino-qualquer' }), rule('attribute', 'matInput')
  ]);
  assert.deepEqual(result.map(r => r.occurrences), [0, 0, 0, 1]);
  for (const target of ['meu-input', 'componente-x']) assert.equal(scan('<input>', [rule('element', 'input', { target })])[0]?.matches[0]?.target, target);
});
test('regras desabilitadas são omitidas, ausência mantém zero e pending', () => {
  const result = scan('<input>', [rule('element', 'input', { enabled: false }), rule('class', 'missing')]);
  assert.equal(result.length, 1); assert.equal(result[0]?.occurrences, 0);
  assert.deepEqual(result[0]?.matches, []); assert.equal(result[0]?.status, 'pending');
});
test('ignora markup em comentários, atributos, interpolação e conteúdo raw-text', () => {
  const result = scan(`<!-- <input class="old" matInput> -->
    {{ '<input>' }} <div title='<input class="old" matInput>'></div>
    <script>"<input class='old' matInput>"</script><style><input></style>
    <textarea><input class="old" matInput></textarea><input class="old" matInput>`,
  [rule('element', 'input'), rule('class', 'old'), rule('attribute', 'matInput')]);
  assert.deepEqual(result.map(r => r.occurrences), [0, 0, 1]);
});
test('bindings dinâmicos não são avaliados como classes ou valores estáticos', () => {
  const result = scan(`<div [class]="'old'" [ngClass]="{old:true}" class="{{ 'old' }}" [data-kind]="'old'"></div>`,
    [rule('class', 'old'), rule('attribute-value', 'old', { attribute: 'data-kind' })]);
  assert.deepEqual(result.map(r => r.occurrences), [0, 0]);
});
test('localizações externas são 1-based e respeitam CRLF e múltiplas tags por linha', () => {
  const result = scan('\r\n  <input><input>\r\n\t<input>', [rule('element', 'input')]);
  assert.deepEqual(result[0]?.matches.map(m => [m.line, m.column]), [[2, 3], [2, 10], [3, 2]]);
});
test('configuração valida tipos, campos, IDs duplicados e enabled sem fallback silencioso', () => {
  const valid = { id: 'test', type: 'element', source: 'input', target: 'app-input' };
  for (const invalid of [null, {}, [null], [{ ...valid, type: 'unknown' }], [{ ...valid, target: '' }],
    [{ ...valid, enabled: 'false' }], [valid, valid], [{ ...valid, type: 'attribute-value' }],
    [{ ...valid, type: 'class', source: 'two classes' }]]) assert.throws(() => validateRules(invalid));
  assert.throws(() => parseRuleConfig('{broken'), /JSON inválido/);
  assert.throws(() => parseRuleConfig('{}'), /migrationRules/);
  assert.deepEqual(parseRuleConfig('{"migrationRules":[]}'), []);
  assert.equal(parseRuleConfig(JSON.stringify({ migrationRules: [valid] }))[0]?.enabled, true);
});
test('matchers são substituíveis sem modificar a orquestração', () => {
  const engine = new RuleEngine([{ type: 'class', *find() { yield { file: 'custom', line: 4, column: 2 }; } }]);
  assert.equal(engine.analyze([rule('class', 'old')], { templates: [] })[0]?.matches[0]?.file, 'custom');
  assert.throws(() => engine.analyze([rule('element', 'input')], { templates: [] }), /não registrado/);
});

test('destinos inválidos são rejeitados antes da análise, inclusive mapeamentos legados', () => {
  const base = { id: 'x', type: 'element', source: 'input', target: 'new' };
  assert.throws(() => validateRules([{ ...base, targetType: ['element'] }]), /targetType/);
  for (const attribute of ['', 'bad name', 'kind']) {
    assert.throws(() => validateRules([{ ...base, targetType: 'attribute-value', attribute }]), /targetAttribute/);
  }
  assert.throws(() => mappingsToRules({ input: 'input' }), /diferentes/);
  assert.throws(() => mappingsToRules({ input: 'two tags' }), /tag/);
  const rules = validateRules([{ ...base, targetType: 'attribute-value', targetAttribute: 'kind' }]);
  const result = scan('<input><div kind="new"></div>', rules);
  assert.equal(result[0]?.remainingOccurrences, 1);
  assert.equal(result[0]?.resolvedOccurrences, 1);
});
test('configuração de exemplo é válida e schema de autocomplete é empacotável', () => {
  const root = join(__dirname, '../..');
  assert.equal(parseRuleConfig(readFileSync(join(root, 'examples/code-insight.example.json'), 'utf8')).length, 5);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const association = manifest.contributes.jsonValidation[0];
  assert.equal(association.fileMatch, '.code-insight.json');
  const schema = JSON.parse(readFileSync(join(root, association.url), 'utf8'));
  assert.deepEqual(schema.properties.migrationRules.items.properties.type.enum, ['element', 'class', 'attribute', 'attribute-value']);
});
test('inline aponta ao TypeScript original, inclusive escapes, Unicode e CRLF', () => {
  const sources = [
    "import { Component } from '@angular/core';\n@Component({template: '<input matInput>\\n<input matInput>'}) class A {}",
    "import { Component } from '@angular/core';\r\n@Component({template: `\r\n  <input matInput>\r\n<input matInput>`}) class A {}",
    String.raw`import { Component } from '@angular/core'; @Component({template: '\u{1F600}<input class=\"old\" matInput>'}) class A {}`,
    String.raw`import { Component } from '@angular/core'; @Component({template: '\x3cinput matInput>'}) class A {}`
  ];
  for (const content of sources) {
    const report = new AngularProjectAnalyzer().analyze({ projectName: 'test', projectId: 'test',
      files: [{ path: 'a.ts', content }], migrationRules: [rule('attribute', 'matInput')] });
    assert.ok(report);
    const offsets = [...content.matchAll(/<input|\\x3cinput/g)].map(m => m.index);
    const expected = offsets.map(offset => {
      const before = content.slice(0, offset).split(/\r\n|\r|\n/);
      return [before.length, (before.at(-1)?.length ?? 0) + 1];
    });
    assert.deepEqual(report.migrationRules[0]?.matches.map(m => [m.line, m.column]), expected);
    assert.deepEqual(JSON.parse(reportJson(report)), report);
    assert.match(reportText(report), /Total de ocorrências de regras:/);
  }
});
