import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VERIFY_ANCHOR_DATE,
  VERIFY_GROUPS,
  isStudyNight,
  verifyGroupOf,
  verifyRoundOf,
  upcomingVerifyRounds,
} from '../data.ts';

// 锚点固定为 2026-11-01（星期日，有晚自习），便于断言
const ANCHOR = DEFAULT_VERIFY_ANCHOR_DATE;

test('锚点当天是第 1 次', () => {
  assert.equal(verifyRoundOf(ANCHOR, ANCHOR), 1);
  assert.equal(verifyGroupOf(ANCHOR, ANCHOR)?.id, VERIFY_GROUPS[0].id);
});

test('只有在晚自习的日子才排次', () => {
  // 2026-11-01 是星期日（有晚自习），11-06 是星期五（无晚自习），11-07 是星期六（无晚自习）
  assert.equal(isStudyNight('2026-11-01'), true);
  assert.equal(isStudyNight('2026-11-06'), false);
  assert.equal(isStudyNight('2026-11-07'), false);
  assert.equal(verifyRoundOf('2026-11-06', ANCHOR), 0);
  assert.equal(verifyRoundOf('2026-11-07', ANCHOR), 0);
  assert.equal(verifyGroupOf('2026-11-06', ANCHOR), undefined);
});

test('按次续排：每个晚自习日推进一轮，非晚自习日不占轮次', () => {
  // 11-01 周日(1) → 11-02 周一(2) → 11-03 周二(3) → 11-04 周三(4) → 11-05 周四(5)
  // → 11-06 周五、11-07 周六 跳过 → 11-08 周日(6) → 11-09 周一(7) → 11-10 周二(回到 1)
  assert.equal(verifyRoundOf('2026-11-02', ANCHOR), 2);
  assert.equal(verifyRoundOf('2026-11-03', ANCHOR), 3);
  assert.equal(verifyRoundOf('2026-11-04', ANCHOR), 4);
  assert.equal(verifyRoundOf('2026-11-05', ANCHOR), 5);
  assert.equal(verifyRoundOf('2026-11-08', ANCHOR), 6);
  assert.equal(verifyRoundOf('2026-11-09', ANCHOR), 7);
  assert.equal(verifyRoundOf('2026-11-10', ANCHOR), 1);
});

test('第七次之后循环回第一次', () => {
  const seq = upcomingVerifyRounds(20, ANCHOR, ANCHOR).map((r) => r.seq);
  assert.equal(seq.length, 20);
  assert.deepEqual(seq.slice(0, 14), [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4, 5, 6, 7]);
  // 任意位置的取值都落在 1..7
  assert.ok(seq.every((s) => s >= 1 && s <= VERIFY_GROUPS.length));
});

test('锚点之前的日期向前回推', () => {
  // 从锚点往前：10-31 周六(无)、10-30 周五(无)、10-29 周四 → 应为第 7 次
  assert.equal(verifyRoundOf('2026-10-29', ANCHOR), 7);
  assert.equal(verifyRoundOf('2026-10-28', ANCHOR), 6);
});

test('upcomingVerifyRounds 只返回晚自习日且日期递增', () => {
  const rows = upcomingVerifyRounds(7, ANCHOR, ANCHOR);
  assert.equal(rows.length, 7);
  assert.ok(rows.every((r) => isStudyNight(r.date)));
  for (let i = 1; i < rows.length; i += 1) {
    assert.ok(rows[i].date > rows[i - 1].date);
  }
  assert.ok(rows.every((r) => r.group && r.group.seq === r.seq));
});

test('每轮都是 1 名组长 + 3 名成员', () => {
  for (const g of VERIFY_GROUPS) {
    assert.ok(g.leaderId, `第 ${g.seq} 次缺少组长`);
    assert.equal(g.memberIds.length, 3, `第 ${g.seq} 次成员数不为 3`);
  }
});
