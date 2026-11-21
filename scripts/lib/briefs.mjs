// Who reviews a run, in what order, on which screens, with which brief. Everything a reviewer is
// told comes from the run (manifest, frame, coverage) through this file, so the orchestrating
// model never fills a template, picks batches, decides coverage or names a file by hand.
//
// Stages run in order; reviewers within a stage run in parallel and never see each other's output:
//   1. cold-read   told nothing: what do the screens themselves say this is?
//   2. frame       the frame challenged, with the cold reading beside it
//   3. critics     the independent critics (and, in a review, the lens reviewers), against the frame
const BATCH = 8;
const WHOLE_MAX = 40;

const primary = (s) => s.captures.find((c) => c.variant === 'light' && (c.device === 'standard' || c.device === 'frame')) || s.captures[0];

/** The screens the critics judge: every screen, or in a review one per screen family plus the journeys. */
export function judgedScreens(manifest, familyOf = () => null) {
  const review = !!(manifest.inventory || (manifest.journeys || []).length);
  if (!review) return { review, screens: manifest.screens, journeys: [] };
  const seen = new Set();
  const screens = [];
  for (const s of manifest.screens.filter((x) => !x.journey)) {
    const family = familyOf(s) || s.id;
    if (s.inventoryState && seen.has(family)) continue;
    seen.add(family);
    screens.push(s);
  }
  return { review, screens, journeys: manifest.journeys || [] };
}

/** Batches of eight; a single batch sees everything, so it is the whole view. */
export function batches(screens, size = BATCH) {
  const out = [];
  for (let i = 0; i < screens.length; i += size) out.push(screens.slice(i, i + size));
  return out;
}

const shots = (run, s, all) => {
  const main = primary(s);
  if (!main) return '';
  const list = [main.screenshot, main.fullPage, ...(all ? s.captures.filter((c) => c !== main).map((c) => c.screenshot) : [])].filter(Boolean);
  return list.map((p) => `${run}/${p}`).join(', ');
};
const table = (run, screens, all) => [
  '| id | title | platform | flow / step | notes | screenshots (standard light first) |',
  '|----|-------|----------|-------------|-------|------------------------------------|',
  ...screens.map((s) => `| ${s.id} | ${s.title} | ${s.platform} | ${s.flow ? `${s.flow} / ${s.step ?? ''}` : ''} | ${String(s.notes || '').replace(/\|/g, '/')} | ${shots(run, s, all)} |`),
].join('\n');

/**
 * ctx: { manifest, runDir, pluginRoot, keyTasks, companions: { name: path|null }, blindKey: [{n,file}],
 *        decisions: path|null, familyOf, coverageFile: bool, hasReferences: bool }
 * Returns { stages: [[reviewer]], reviewers } where a reviewer is
 *   { name, stage, critic, agent, model, coverage, file, brief, save }.
 */
export function planReviewers(ctx) {
  const { manifest, runDir: run, pluginRoot: root, keyTasks = [], companions = {}, blindKey = [], decisions = null, familyOf } = ctx;
  const { review, screens, journeys } = judgedScreens(manifest, familyOf);
  const model = manifest.critics?.judge_model || null;
  const gate = manifest.gate || {};
  const path = (name) => companions[name] || 'not installed';
  const save = (critic, name, extra = '') => `node ${root}/scripts/report/save-critique.mjs --run ${run} --critic ${critic}${name !== critic ? ` --name ${name}` : ''}${extra} --from <the reply saved to a file, or the agent's transcript .jsonl>`;
  const tasks = keyTasks.length ? keyTasks.map((t) => `${t.id} ${t.name}${t.critical ? ' (must not fail)' : ''}`).join('; ') : 'none could be read from the frame: score no tasks, and say so in frame_check.summary';
  const common = [
    `Run folder: ${run}`,
    `Problem frame (read first): ${run}/framing.md`,
    `Principles index (IDs for rule and basis): ${root}/skills/principles/references/`,
    `Output format: ${root}/skills/critique/references/output-format.md`,
    `Severity rules: ${root}/skills/critique/references/severity.md`,
    `Deterministic findings already reported (don't repeat them; build on one only to say why it matters for a key task): ${run}/checks/all.json`,
    `Decisions the designer made on earlier findings and questions: ${decisions || 'none'}`,
  ];
  const evidence = [
    `Design tokens: ${manifest.designSnapshot ? `${run}/${manifest.designSnapshot}` : 'none'}`,
    `Content guide: ${manifest.contentSnapshot ? `${run}/${manifest.contentSnapshot}` : 'none'}`,
    `Reference screens from shipped apps: ${ctx.hasReferences ? `${run}/references.md` : 'none'}`,
    `Direction the designer chose (context only; don't score closeness, never excuse a finding by it): ${(manifest.taste || []).length ? (manifest.taste || []).map((t) => `${run}/${t}`).join(', ') : 'none'}`,
    `Gate: ${gate.enabled === false ? 'off (score honestly all the same)' : `fail on ${gate.fail_on}, target score ${gate.target_score ?? 'none'} (score honestly; the gate uses the lowest)`}`,
  ];
  const sparring = 'Beyond findings: put concept-level or uncertain concerns in "challenges" (a position and a question for the designer, never a severity), other ways to solve a finding in its "alternatives", and what you did not or could not look at in "not_examined".';
  const journeyBlock = journeys.length ? [
    '',
    `Journeys lens (read ${root}/skills/review/references/lenses/journeys.md): return "journeys", one per journey below, with a verdict per step.`,
    ...journeys.map((j) => `- ${j.id} "${j.title}"${j.critical ? ' (must not fail)' : ''}: ${j.screens.map((id, k) => `${k ? `[${j.steps[k - 1]}] ` : ''}${id}`).join(' → ')}${j.brokenAt != null ? ` — broke at step ${j.brokenAt}: ${j.error}` : ''}`),
    'Journey screens (standard light):',
    table(run, manifest.screens.filter((s) => s.journey), false),
  ] : [];

  const reviewers = [];
  const add = (r) => reviewers.push({ model, ...r });

  // ---- 1. cold read
  if (blindKey.length) add({
    name: 'cold-read', stage: 1, critic: null, agent: 'designcritique:cold-reader', coverage: null, file: 'blind/reading.json',
    brief: ['Read these phone screenshots cold. Open only these files, in order:', ...blindKey.map((k) => `${k.n}. ${run}/${k.file}`), '', 'Return only the JSON object your instructions describe.'].join('\n'),
    save: `node ${root}/scripts/report/save-critique.mjs --run ${run} --blind --from <the reply saved to a file>`,
  });

  // ---- 2. the frame, challenged
  if (manifest.framingSnapshot) add({
    name: 'frame', stage: 2, critic: 'frame', agent: 'designcritique:frame-challenger', coverage: null, file: 'critique/frame.json',
    brief: [
      'Challenge the frame and concept of this product before anyone critiques its screens.',
      '',
      `Frame: ${run}/framing.md`,
      `Cold reading (a reviewer told nothing; read it after the frame): ${blindKey.length ? `${run}/blind/reading.json` : 'none'}`,
      `Screens, numbered, without names: ${blindKey.map((k) => `${run}/${k.file}`).join(', ') || 'none'}`,
      `Method (read this SKILL.md first): product-brainstorming: ${path('product-brainstorming')}`,
      `Principles: ${root}/skills/principles/references/framing.md`,
      `Output format: ${root}/skills/critique/references/output-format.md`,
      `Decisions and answers the designer already gave: ${decisions || 'none'}`,
      '',
      'Return only the JSON object, with "critic": "frame".',
    ].join('\n'),
    save: save('frame', 'frame'),
  });

  // ---- 3. the critics
  const groups = batches(screens);
  const single = groups.length <= 1;
  const reviewerBrief = (list, coverage, all) => [
    `Review these mobile app ${review ? 'screens (one per screen family of the whole prototype)' : 'mockups'}.`,
    '',
    ...common, ...evidence,
    'Methods (read these SKILL.md files first; from Anthropic\'s design plugin):',
    `  design-critique: ${path('design-critique')}`,
    `  accessibility-review: ${path('accessibility-review')}`,
    `  ux-copy: ${path('ux-copy')}`,
    `Companion guidance for the platform, if installed: ${['material-3', 'expo-design-system', 'expo-native-ui'].map((n) => companions[n]).filter(Boolean).join(', ') || 'none'}`,
    `Key tasks to score, by ID: ${tasks}. Coverage: ${coverage} (${coverage === 'whole' ? 'you have every screen' : 'a batch: you have only some of the screens, so mark a task whose screens you lack "not-covered"'}).`,
    sparring,
    '',
    'Screens, in flow order:',
    table(run, list, all),
    ...(coverage === 'whole' ? journeyBlock : []),
    '',
    'Return only the JSON object described in the output format, with "critic": "anthropic-design".',
  ].join('\n');
  if (single) {
    add({ name: 'anthropic-design', stage: 3, critic: 'anthropic-design', agent: 'designcritique:design-reviewer', coverage: 'whole', file: 'critique/anthropic-design.json', brief: reviewerBrief(screens, 'whole', true), save: save('anthropic-design', 'anthropic-design', ' --coverage whole') });
  } else {
    // One reviewer walks every key task across all screens (standard light only), and scores them;
    // the batches look closely at eight screens each, in every variant, and don't gate.
    const whole = screens.slice(0, WHOLE_MAX);
    add({ name: 'anthropic-design', stage: 3, critic: 'anthropic-design', agent: 'designcritique:design-reviewer', coverage: whole.length === screens.length ? 'whole' : 'partial', file: 'critique/anthropic-design.json', brief: reviewerBrief(whole, whole.length === screens.length ? 'whole' : 'partial', false), save: save('anthropic-design', 'anthropic-design', ` --coverage ${whole.length === screens.length ? 'whole' : 'partial'}`) });
    groups.forEach((g, i) => add({ name: `anthropic-design-${i + 2}`, stage: 3, critic: 'anthropic-design', agent: 'designcritique:design-reviewer', coverage: 'partial', file: `critique/anthropic-design-${i + 2}.json`, brief: reviewerBrief(g, 'partial', true), save: save('anthropic-design', `anthropic-design-${i + 2}`, ' --coverage partial') }));
  }

  // Impeccable: the same evidence as the design-reviewer, so the two judge the same thing.
  if (companions.impeccable) {
    const list = screens.slice(0, WHOLE_MAX);
    const cov = list.length === screens.length ? 'whole' : 'partial';
    add({
      name: 'impeccable', stage: 3, critic: 'impeccable', agent: 'general-purpose', coverage: cov, file: 'critique/impeccable.json',
      brief: [
        'Run Impeccable\'s critique on these mobile screens. Follow the Impeccable skill\'s critique reference, including its rules for native platforms (ios / android / adaptive). Don\'t run its detector: designcritique already ran it as a check. Don\'t load other design skills. Don\'t edit any files. Skip the closing questions and write "Questions skipped: run inside designcritique".',
        '',
        `Impeccable skill: ${companions.impeccable}`,
        ...common, ...evidence,
        `Product context (Impeccable reads it; use this snapshot, not the project's live file): ${run}/framing.md`,
        `Key tasks to score, by ID: ${tasks}. Coverage: ${cov}.`,
        '',
        'Screens (HTML source where there is one, then screenshots):',
        ...list.map((s) => `- ${s.id}: ${s.kind === 'html' && !/^https?:/.test(s.source) ? `${manifest.baseDir}/${s.source}` : s.source || 'image'}${(s.steps || []).length ? ' (reached by steps: judge the screenshot)' : ''}; ${shots(run, s, true)}`),
        ...(cov === 'whole' ? journeyBlock : []),
        '',
        `Afterwards, convert every Priority Issue, persona red flag and minor observation into the designcritique findings format, with "critic": "impeccable". Set each finding's severity by severity.md (the same scale the other critic uses) and quote Impeccable's own priority in "evidence". Map each issue to the closest principle ID in the list of valid IDs in output-format.md, and quote Impeccable's own label in "evidence". Add a 0-10 score for each key task by its ID, using the anchors in output-format.md, and an overall frame_check.score. Put its heuristic scores and Design Health Score in "frame_check.summary". ${sparring} Don't raise findings the designer dismissed without new evidence. Return only the JSON object.`,
      ].join('\n'),
      save: save('impeccable', 'impeccable', ` --coverage ${cov}`),
    });
  }

  // The lens reviewers of a whole-product review.
  if (review) {
    const families = table(run, screens, false);
    const lens = (critic, agent, extra) => add({
      name: critic, stage: 3, critic, agent: `designcritique:${agent}`, coverage: null, file: `critique/${critic}.json`,
      brief: [
        `Review the whole product through the ${critic} lens.`,
        '',
        `What every lens reviewer reads and returns: ${root}/skills/review/references/lenses/common.md`,
        `Your lens: ${root}/skills/review/references/lenses/${critic}.md`,
        ...common,
        `Coverage: ${run}/coverage.json`,
        `Navigation graph and crawl inventory: ${manifest.inventory ? `${run}/graph.json, ${run}/${manifest.inventory}` : 'none (no crawl)'}`,
        `Structure and consistency checks in full: ${run}/checks/structure.json, ${run}/checks/consistency.json; inventory: ${run}/consistency.json`,
        ...extra,
        sparring,
        '',
        'One standard light screenshot per screen family:',
        families,
        ...journeyBlock.slice(2),
        '',
        `Return only the JSON object, with "critic": "${critic}".`,
      ].join('\n'),
      save: save(critic, critic),
    });
    lens('ia', 'ia-reviewer', []);
    lens('scope', 'scope-reviewer', [`Methods (read these SKILL.md files first): product-brainstorming: ${path('product-brainstorming')}; write-spec: ${path('write-spec')}`]);
    lens('system', 'system-reviewer', [
      `Methods (read first): design-system: ${path('design-system')}; Impeccable harden reference: ${companions.impeccable ? `${String(companions.impeccable).replace(/SKILL\.md$/, '')}reference/harden.md (if present)` : 'not installed'}`,
      `The owner's own rules to check conformance against: design tokens ${manifest.designSnapshot ? `${run}/${manifest.designSnapshot}` : 'none'}; content guide ${manifest.contentSnapshot ? `${run}/${manifest.contentSnapshot}` : 'none'}; the Navigation and Journeys sections of ${run}/framing.md`,
    ]);
  }

  // Extra judges on other tools get the design-reviewer's whole-view brief under their own name.
  for (const name of manifest.critics?.external || []) {
    const base = reviewers.find((r) => r.name === 'anthropic-design');
    add({ name: `external-${name}`, stage: 3, critic: `external-${name}`, agent: null, coverage: base.coverage, file: `critique/external-${name}.json`, brief: base.brief.replace('"critic": "anthropic-design"', `"critic": "external-${name}"`), save: save(`external-${name}`, `external-${name}`, ` --coverage ${base.coverage}`) });
  }

  const stages = [1, 2, 3].map((n) => reviewers.filter((r) => r.stage === n)).filter((s) => s.length);
  return { review, screens: screens.length, reviewers, stages };
}
