import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beijingParts,
  beijingTodayStr,
  beijingTimeStr,
  beijingStampStr,
  weekdayOf,
  UPLOAD_DEADLINE,
} from '../data.ts';

// 北京时间 2026-11-04 00:30 == UTC 2026-11-03 16:30
const CROSS_DAY = Date.parse('2026-11-03T16:30:00Z');
// 北京时间 2026-11-04 21:00 == 新疆时间（UTC+6）19:00
const EVENING = Date.parse('2026-11-04T13:00:00Z');

test('北京时间换算：UTC 下午对应北京时间次日凌晨', () => {
  const p = beijingParts(CROSS_DAY);
  assert.deepEqual(
    { year: p.year, month: p.month, day: p.day, hours: p.hours, minutes: p.minutes },
    { year: 2026, month: 11, day: 4, hours: 0, minutes: 30 },
  );
  assert.equal(beijingTodayStr(CROSS_DAY), '2026-11-04');
  assert.equal(beijingTimeStr(CROSS_DAY), '00:30:00');
  assert.equal(beijingStampStr(CROSS_DAY), '2026-11-04 00:30');
});

test('新疆时间设备（UTC+6）的晚间操作仍按北京时间判定跨日与截止', () => {
  assert.equal(beijingTodayStr(EVENING), '2026-11-04');
  const p = beijingParts(EVENING);
  assert.equal(p.hours, 21);
  const [h, m] = UPLOAD_DEADLINE.split(':').map(Number);
  assert.equal(p.hours * 60 + p.minutes > h * 60 + m, true, '北京时间 21:00 应已过 20:59 截止');
});

test('切换进程时区不改变业务日期与时间', () => {
  const original = process.env.TZ;
  try {
    const results = ['Asia/Shanghai', 'America/New_York', 'UTC', 'Asia/Kolkata'].map((tz) => {
      process.env.TZ = tz;
      return `${beijingTodayStr(CROSS_DAY)}|${beijingTimeStr(CROSS_DAY)}`;
    });
    assert.equal(new Set(results).size, 1, '业务时间不得随设备时区变化');
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test('纯日期的星期计算不受时区影响', () => {
  assert.equal(weekdayOf('2026-11-04'), '星期三');
  assert.equal(weekdayOf('2026-11-01'), '星期日');
});
