/**
 * Build src/lang/zh-CN.supplement.json.
 *
 * The synced catalog in src/lang/zh-CN.json does not cover every current
 * English string. This script fills the gaps:
 *   1. Exact English `defaultMessage` entries in zh-cn-overrides.js and zh-cn-extra-*.json
 *   2. Otherwise, a Chinese string already used for that same English text
 *
 * Add a new translation by putting the exact English defaultMessage in
 * zh-cn-overrides.js or a zh-cn-extra-*.json file, then run `yarn i18n:zh`.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('@formatjs/icu-messageformat-parser');

const ROOT = path.join(__dirname, '..');
const EN_PATH = path.join(ROOT, 'src/lang/default/en.json');
const ZH_PATH = path.join(ROOT, 'src/lang/zh-CN.json');
const OUT_PATH = path.join(ROOT, 'src/lang/zh-CN.supplement.json');
const overrides = {
  ...require('./zh-cn-overrides'),
  ...Object.assign(
    {},
    ...fs
      .readdirSync(__dirname)
      .filter((name) => /^zh-cn-extra-\d+\.json$/.test(name))
      .sort()
      .map((name) => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'))),
  ),
};

function messageId(defaultMessage, description) {
  const content = description ? `${defaultMessage}#${description}` : defaultMessage;
  return crypto.createHash('sha512').update(content).digest('base64').slice(0, 6);
}

function messageSkeleton(value) {
  let ast;
  try {
    ast = parse(value);
  } catch (error) {
    throw new Error(`Invalid ICU message ${JSON.stringify(value)}: ${error.message}`);
  }
  const variables = [];
  const tags = [];
  const structures = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      // 1 argument, 2 number, 3 date, 4 time, 5 select, 6 plural
      if (node.type >= 1 && node.type <= 6 && typeof node.value === 'string') {
        variables.push(node.value);
      }
      if (node.type === 5 || node.type === 6) {
        structures.push(`${node.value}:${Object.keys(node.options).sort().join('|')}`);
        for (const option of Object.values(node.options)) {
          walk(option.value);
        }
      }
      if (node.type === 8) {
        tags.push(node.value);
        walk(node.children);
      }
    }
  };
  walk(ast);
  return {
    variables: variables.sort().join(','),
    tags: tags.sort().join(','),
    structures: structures.sort().join(','),
  };
}

function assertPlaceholders(english, chinese) {
  const source = messageSkeleton(english);
  const translation = messageSkeleton(chinese);
  if (
    source.variables !== translation.variables ||
    source.tags !== translation.tags ||
    source.structures !== translation.structures
  ) {
    throw new Error(
      `ICU mismatch for ${JSON.stringify(english)}\n  en ${JSON.stringify(source)}\n  zh ${JSON.stringify(translation)}`,
    );
  }
}

function bestReuse(votes) {
  let bestText;
  let bestCount = 0;
  for (const [text, count] of votes) {
    if (count > bestCount) {
      bestText = text;
      bestCount = count;
    }
  }
  return bestText;
}

function main() {
  const en = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'));
  const zh = JSON.parse(fs.readFileSync(ZH_PATH, 'utf8'));
  const votes = new Map();

  for (const [id, enEntry] of Object.entries(en)) {
    const zhEntry = zh[id];
    if (!zhEntry || typeof enEntry.defaultMessage !== 'string' || typeof zhEntry.defaultMessage !== 'string') {
      continue;
    }
    if (enEntry.defaultMessage === zhEntry.defaultMessage) {
      continue;
    }
    if (!votes.has(enEntry.defaultMessage)) {
      votes.set(enEntry.defaultMessage, new Map());
    }
    const bucket = votes.get(enEntry.defaultMessage);
    bucket.set(zhEntry.defaultMessage, (bucket.get(zhEntry.defaultMessage) || 0) + 1);
  }

  const messages = {};
  let fromOverride = 0;
  let fromReuse = 0;
  const usedOverrides = new Set();

  for (const [id, enEntry] of Object.entries(en)) {
    if (zh[id] || typeof enEntry.defaultMessage !== 'string') {
      continue;
    }
    const english = enEntry.defaultMessage;
    let chinese;
    if (Object.prototype.hasOwnProperty.call(overrides, english)) {
      chinese = overrides[english];
      usedOverrides.add(english);
      fromOverride += 1;
    } else {
      const bucket = votes.get(english);
      chinese = bucket ? bestReuse(bucket) : undefined;
      if (chinese) {
        fromReuse += 1;
      }
    }
    if (typeof chinese !== 'string' || chinese.length === 0) {
      continue;
    }
    const fromExplicitOverride = usedOverrides.has(english);
    if (fromExplicitOverride) {
      assertPlaceholders(english, chinese);
    } else {
      try {
        assertPlaceholders(english, chinese);
      } catch (error) {
        // Skip a reused translation whose ICU skeleton does not match.
        continue;
      }
    }
    messages[id] = chinese;
  }

  // A handful of synced translations left the English product word in the sidebar.
  const forced = [
    {
      defaultMessage: 'Endpoints',
      description: 'Sidebar link for gateway endpoints',
      translation: '端点',
    },
  ];
  for (const entry of forced) {
    const id = messageId(entry.defaultMessage, entry.description);
    if (!en[id]) {
      throw new Error(`Forced translation does not match a catalog id: ${entry.defaultMessage}`);
    }
    assertPlaceholders(entry.defaultMessage, entry.translation);
    messages[id] = entry.translation;
  }

  const unused = Object.keys(overrides).filter((key) => !usedOverrides.has(key));
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(messages, null, 2)}\n`);
  console.log(
    `Wrote ${Object.keys(messages).length} zh-CN messages (${fromOverride} from overrides, ${fromReuse} reused).`,
  );
  if (unused.length > 0) {
    console.log(`${unused.length} override strings are not missing from zh-CN.json (already translated or not in en.json):`);
    for (const key of unused.slice(0, 30)) {
      console.log(`  - ${JSON.stringify(key)}`);
    }
  }
}

main();
