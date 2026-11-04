import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySwapToRoster,
  createSwapRequest,
  getSwapWeeks,
  respondSwapRequest,
  validateSwap,
} from './roster.ts';

// 全部使用隔离的合成人员与排班，不读取或改写真实考勤记录。
const staff = [
  { id: 'a', name: '测试甲' },
  { id: 'b', name: '测试乙' },
  { id: 'c', name: '测试丙' },
  { id: 'd', name: '测试丁' },
];
const actor = (staffId) => ({ role: 'inspector', enabled: true, staffId });
const input = (patch = {}) => ({
  staffId: 'a', staffName: '测试甲',
  targetStaffId: 'b', targetStaffName: '测试乙',
  fromWeekday: '星期一', fromType: '查班',
  toWeekday: '星期二', toType: '考勤',
  reason: '课程时间调整',
  ...patch,
});
const shift = (id, weekday, type, staffIds) => ({ id, weekday, type, staffIds });
const state = () => ({
  roster: {
    本周: [
      shift('same-id', '星期一', '查班', ['a', 'c']),
      shift('att', '星期二', '考勤', ['b', 'd']),
      shift('phone', '星期二', '查手机', ['b', 'd']),
    ],
    下周: [
      shift('same-id', '星期一', '查班', ['a', 'd']),
      shift('att', '星期二', '考勤', ['b', 'c']),
      shift('phone', '星期二', '查手机', ['b', 'c']),
    ],
  },
  swaps: [],
  notices: [],
});
function freeze(value) {
  Object.values(value).forEach((item) => {
    if (item && typeof item === 'object') freeze(item);
  });
  return Object.freeze(value);
}
function submit(current, selection = input(), user = actor('a'), id = 'sw1') {
  return createSwapRequest(current, selection, user, staff, { id, createdAt: '2026-10-31 12:00' });
}
function success(result) {
  assert.equal(result.ok, true, result.error);
  return result.state;
}
function failure(result, message) {
  assert.equal(result.ok, false);
  assert.match(result.error, message);
}
function respond(current, agree = true, user = actor('b'), id = 'sw1', note) {
  return respondSwapRequest(current, id, agree, user, {
    noticeId: 'nt1', reviewedAt: '2026-10-31 12:30', note,
  });
}

test('旧申请默认本周，缺省目标周沿用来源周', () => {
  assert.deepEqual(getSwapWeeks({}), { week: '本周', targetWeek: '本周' });
  assert.deepEqual(getSwapWeeks({ week: '下周' }), { week: '下周', targetWeek: '下周' });
  assert.deepEqual(getSwapWeeks({ targetWeek: '下周' }), { week: '本周', targetWeek: '下周' });
});

for (const [week, targetWeek] of [
  ['本周', '本周'], ['下周', '下周'], ['本周', '下周'], ['下周', '本周'],
]) {
  test(`${week} → ${targetWeek}：同意后双向交换且不改动输入和其他班次`, () => {
    const original = freeze(state());
    const before = JSON.stringify(original);
    const pending = freeze(success(submit(original, input({ week, targetWeek }))));
    assert.equal(pending.roster, original.roster);
    assert.equal(pending.notices, original.notices);
    assert.equal(pending.swaps[0].status, 'pending');
    const updated = success(respond(pending, true, actor('b'), 'sw1', '可以换班'));
    assert.deepEqual(updated.roster[week][0].staffIds, ['b', week === '本周' ? 'c' : 'd']);
    assert.deepEqual(updated.roster[targetWeek][1].staffIds, ['a', targetWeek === '本周' ? 'd' : 'c']);
    for (const currentWeek of ['本周', '下周']) {
      original.roster[currentWeek].forEach((entry, index) => {
        assert.equal(updated.roster[currentWeek][index].staffIds.length, entry.staffIds.length);
        if (!((currentWeek === week && index === 0) || (currentWeek === targetWeek && index === 1))) {
          assert.equal(updated.roster[currentWeek][index], entry);
        }
      });
    }
    assert.equal(updated.swaps[0].status, 'approved');
    assert.equal(updated.swaps[0].reviewNote, '可以换班');
    assert.equal(updated.swaps[0].reviewedAt, '2026-10-31 12:30');
    assert.equal(updated.notices.length, 1);
    assert.equal(updated.notices[0].swapId, 'sw1');
    assert.equal(updated.notices[0].toStaffName, '测试甲');
    assert.equal(updated.notices[0].result, 'approved');
    assert.equal(updated.notices[0].read, false);
    assert.ok(updated.notices[0].detail.includes(`${targetWeek}星期二（考勤）`));
    assert.ok(updated.notices[0].detail.includes(`${week}星期一（查班）`));
    assert.equal(JSON.stringify(original), before);
  });
}

test('缺省周次的旧 pending 仍可以同意', () => {
  const current = state();
  current.swaps.push({ ...input(), id: 'sw1', status: 'pending', createdAt: '2026-10-30 12:00' });
  const updated = success(respond(freeze(current)));
  assert.deepEqual(updated.roster.本周[0].staffIds, ['b', 'c']);
  assert.equal(updated.roster.下周, current.roster.下周);
});

test('跨周同星期同类型且复用班次 ID，可以正确交换', () => {
  const current = state();
  current.roster.下周[0].staffIds = ['b', 'd'];
  const selection = input({ targetWeek: '下周', toWeekday: '星期一', toType: '查班' });
  const updated = success(respond(success(submit(freeze(current), selection))));
  assert.deepEqual(updated.roster.本周[0].staffIds, ['b', 'c']);
  assert.deepEqual(updated.roster.下周[0].staffIds, ['a', 'd']);
});

test('来源和目标分别校验各自周次，不借用另一周人员', () => {
  const current = state();
  current.roster.下周[1].staffIds = ['c', 'd'];
  failure(submit(current, input({ targetWeek: '下周' })), /不在对应班次/);
  current.roster.下周[0].staffIds = ['c', 'd'];
  failure(submit(current, input({ week: '下周', targetWeek: '本周' })), /不在对应班次/);
});

test('拒绝跨周申请：排班保持原引用并通知发起人', () => {
  const pending = freeze(success(submit(state(), input({ targetWeek: '下周' }))));
  const updated = success(respond(pending, false, actor('b'), 'sw1', '课程不便'));
  assert.equal(updated.roster, pending.roster);
  assert.equal(updated.swaps[0].status, 'rejected');
  assert.equal(updated.swaps[0].reviewNote, '课程不便');
  assert.equal(updated.notices[0].result, 'rejected');
  assert.match(updated.notices[0].detail, /本周星期一.*下周星期二.*保持不变/);
});

test('排班变化后同意失败，无半次交换、无结果通知', () => {
  const pending = success(submit(state(), input({ targetWeek: '下周' })));
  pending.roster.下周[1].staffIds = ['c', 'd'];
  const before = JSON.stringify(pending);
  failure(respond(freeze(pending)), /不在对应班次/);
  assert.equal(JSON.stringify(pending), before);
  assert.equal(pending.swaps[0].status, 'pending');
  assert.equal(pending.notices.length, 0);
});

test('排班变化后仍允许指定同学拒绝', () => {
  const pending = success(submit(state()));
  pending.roster.本周 = [];
  const updated = success(respond(freeze(pending), false));
  assert.equal(updated.roster, pending.roster);
  assert.equal(updated.swaps[0].status, 'rejected');
  assert.equal(updated.notices.length, 1);
});

test('发起账号必须为本人且为启用的干事账号', () => {
  for (const user of [null, actor('c'), { ...actor('a'), enabled: false }, { ...actor('a'), role: 'admin' }]) {
    failure(submit(freeze(state()), input(), user), /本人干事账号/);
  }
  failure(submit(state(), input({ staffName: '测试丙' })), /人员信息不匹配/);
  failure(submit(state(), input({ targetStaffName: '测试丁' })), /人员信息不匹配/);
  failure(submit(state(), input({ targetStaffId: 'missing' })), /人员信息不匹配/);
});

test('只有指定且启用的干事可回应；重复或不存在的回应不产生通知', () => {
  const pending = freeze(success(submit(state())));
  for (const user of [null, actor('a'), actor('c'), { ...actor('b'), enabled: false }, { ...actor('b'), role: 'committee' }]) {
    failure(respond(pending, true, user), /指定的替班同学/);
    failure(respond(pending, false, user), /指定的替班同学/);
  }
  failure(respond(pending, true, actor('b'), 'missing'), /不存在或已经回应/);
  for (const agree of [true, false]) {
    const updated = freeze(success(respond(pending, agree)));
    failure(respond(updated, agree), /不存在或已经回应/);
    assert.equal(updated.notices.length, 1);
  }
});

test('重复 pending 使用规范化周次检测，不受原因或反向提交影响', () => {
  const pending = freeze(success(submit(state())));
  failure(submit(pending, input({ week: '本周', targetWeek: '本周', reason: '另一个原因' })), /待回应/);
  const reverse = input({
    staffId: 'b', staffName: '测试乙', targetStaffId: 'a', targetStaffName: '测试甲',
    fromWeekday: '星期二', fromType: '考勤', toWeekday: '星期一', toType: '查班',
  });
  failure(submit(pending, reverse, actor('b')), /待回应/);
});

test('pending 占用的任一人员班次不能再次申请其他交换', () => {
  const pending = freeze(success(submit(state())));
  failure(submit(pending, input({ targetStaffId: 'd', targetStaffName: '测试丁' })), /待回应/);
  failure(submit(pending, input({ staffId: 'c', staffName: '测试丙' }), actor('c')), /待回应/);
});

test('不同周次、不同人员班次的申请相互独立', () => {
  const pending = freeze(success(submit(state())));
  const nextWeek = success(submit(pending, input({ week: '下周' }), actor('a'), 'sw2'));
  assert.equal(nextWeek.swaps.length, 2);
  const other = success(submit(pending, input({
    staffId: 'c', staffName: '测试丙', targetStaffId: 'd', targetStaffName: '测试丁',
  }), actor('c'), 'sw3'));
  assert.equal(other.swaps.length, 2);
});

test('拒绝的历史申请不占用 pending，可重新提交', () => {
  const rejected = freeze(success(respond(success(submit(state())), false)));
  const updated = success(submit(rejected, input(), actor('a'), 'sw2'));
  assert.equal(updated.swaps[0].status, 'pending');
  assert.equal(updated.swaps[1].status, 'rejected');
});

test('来源或目标班次存在重复成员时拒绝，避免人数和人员异常', () => {
  for (const index of [0, 1]) {
    const current = state();
    current.roster.本周[index].staffIds.push(current.roster.本周[index].staffIds[0]);
    assert.match(validateSwap(freeze(current).roster, input()), /重复人员/);
    failure(applySwapToRoster(current.roster, input()), /重复人员/);
  }
});

test('交换后的人员不能在对方班次重复', () => {
  for (const [index, id] of [[0, 'b'], [1, 'a']]) {
    const current = state();
    current.roster.本周[index].staffIds.push(id);
    failure(submit(freeze(current)), /重复安排人员/);
  }
});

test('同一班次不可自换，来源和目标人员不可相同', () => {
  const current = freeze(state());
  assert.match(validateSwap(current.roster, input({
    toWeekday: '星期一', toType: '查班', targetStaffId: 'c',
  })), /班次不能相同/);
  assert.match(validateSwap(current.roster, input({ targetStaffId: 'a' })), /不同的有效值班人员/);
});

test('缺失或重复班次、无效人员和周次均返回业务错误且不改表', () => {
  const current = state();
  assert.match(validateSwap(current.roster, input({ toWeekday: '不存在' })), /不存在或重复/);
  assert.match(validateSwap(current.roster, input({ week: '其他周' })), /有效的来源周/);
  assert.match(validateSwap(current.roster, input({ targetWeek: '其他周' })), /有效的来源周/);
  assert.match(validateSwap(current.roster, input({ staffId: '' })), /有效值班人员/);
  current.roster.本周.push({ ...current.roster.本周[0], id: 'duplicate-cell' });
  failure(submit(freeze(current)), /不存在或重复/);
  const blank = state();
  blank.roster.本周[0].staffIds.push('');
  failure(submit(freeze(blank)), /无效或重复人员/);
});

test('提交时拒绝空白原因并规范化周次、原因，不预先变更排班', () => {
  const current = freeze(state());
  failure(submit(current, input({ reason: '   ' })), /填写调班原因/);
  const updated = success(submit(current, input({ reason: '  课程调整  ' })));
  assert.equal(updated.roster, current.roster);
  assert.equal(updated.swaps[0].reason, '课程调整');
  assert.equal(updated.swaps[0].week, '本周');
  assert.equal(updated.swaps[0].targetWeek, '本周');
});

test('跨类型交换按目标类型生效，不擅自修改同日其他值班', () => {
  const current = freeze(state());
  const updated = success(respond(success(submit(current, input({ toType: '查手机', targetWeek: '下周' })))));
  assert.deepEqual(updated.roster.本周[0].staffIds, ['b', 'c']);
  assert.deepEqual(updated.roster.下周[2].staffIds, ['a', 'c']);
  assert.equal(updated.roster.下周[1], current.roster.下周[1]);
});

for (const week of ['本周', '下周']) {
  test(`${week}缺省目标周：提交、回应均只交换来源周`, () => {
    const current = freeze(state());
    const pending = freeze(success(submit(current, input({ week }))));
    assert.equal(pending.swaps[0].week, week);
    assert.equal(pending.swaps[0].targetWeek, week);
    assert.equal(pending.roster, current.roster);
    const updated = success(respond(pending));
    assert.deepEqual(updated.roster[week][0].staffIds, ['b', week === '本周' ? 'c' : 'd']);
    assert.deepEqual(updated.roster[week][1].staffIds, ['a', week === '本周' ? 'd' : 'c']);
    const untouchedWeek = week === '本周' ? '下周' : '本周';
    assert.equal(updated.roster[untouchedWeek], current.roster[untouchedWeek]);
  });
}

test('旧下周申请缺省目标周：回应时沿用下周，不改本周', () => {
  const current = state();
  current.swaps.push({
    ...input({ week: '下周' }), id: 'sw1', status: 'pending', createdAt: '2026-10-30 12:00',
  });
  const updated = success(respond(freeze(current)));
  assert.equal(updated.roster.本周, current.roster.本周);
  assert.deepEqual(updated.roster.下周[0].staffIds, ['b', 'd']);
  assert.deepEqual(updated.roster.下周[1].staffIds, ['a', 'c']);
  assert.match(updated.notices[0].detail, /你改为下周星期二（考勤）/);
});

test('跨周 pending 分别占用两端人员班次，反向申请也被拦截', () => {
  const pending = freeze(success(submit(state(), input({ targetWeek: '下周' }))));
  failure(submit(pending, input()), /待回应/);
  failure(submit(pending, input({ week: '下周' })), /待回应/);
  failure(submit(pending, input({
    staffId: 'b', staffName: '测试乙', targetStaffId: 'a', targetStaffName: '测试甲',
    week: '下周', targetWeek: '本周',
    fromWeekday: '星期二', fromType: '考勤', toWeekday: '星期一', toType: '查班',
  }), actor('b')), /待回应/);
  assert.equal(pending.swaps.length, 1);
  assert.equal(pending.notices.length, 0);
});

test('相同人员的另一组跨周班次可独立申请，连续同意互不覆盖', () => {
  const first = success(submit(state(), input({ targetWeek: '下周' })));
  const pending = freeze(success(submit(first, input({ week: '下周', targetWeek: '本周' }), actor('a'), 'sw2')));
  const afterFirst = freeze(success(respond(pending)));
  assert.equal(afterFirst.swaps.find((s) => s.id === 'sw2').status, 'pending');
  const updated = success(respondSwapRequest(afterFirst, 'sw2', true, actor('b'), {
    noticeId: 'nt2', reviewedAt: '2026-10-31 12:35',
  }));
  assert.deepEqual(updated.roster.本周[0].staffIds, ['b', 'c']);
  assert.deepEqual(updated.roster.本周[1].staffIds, ['a', 'd']);
  assert.deepEqual(updated.roster.下周[0].staffIds, ['b', 'd']);
  assert.deepEqual(updated.roster.下周[1].staffIds, ['a', 'c']);
  assert.ok(updated.swaps.every((s) => s.status === 'approved'));
  assert.deepEqual(updated.notices.map((n) => n.swapId), ['sw2', 'sw1']);
  assert.equal(updated.notices[1], afterFirst.notices[0]);
});

for (const [week, index, missingStaffId, duplicateStaffId] of [
  ['本周', 0, 'a', 'b'], ['下周', 1, 'b', 'a'],
]) {
  test(`跨周同意重新校验${week}：任一端缺员或重复均不发生半次交换`, () => {
    for (const change of ['缺员', '重复', '缺班']) {
      const pending = success(submit(state(), input({ targetWeek: '下周' })));
      const shift = pending.roster[week][index];
      if (change === '缺员') shift.staffIds = shift.staffIds.filter((id) => id !== missingStaffId);
      if (change === '重复') shift.staffIds.push(duplicateStaffId);
      if (change === '缺班') pending.roster[week].splice(index, 1);
      const before = JSON.stringify(pending);
      failure(respond(freeze(pending)), /不在对应班次|重复安排人员|不存在或重复/);
      assert.equal(JSON.stringify(pending), before);
      assert.equal(pending.swaps[0].status, 'pending');
      assert.equal(pending.notices.length, 0);
    }
  });
}

test('跨周排班两端均已移除仍可拒绝，保留历史通知并使用默认回复', () => {
  const current = state();
  const previousNotice = {
    id: 'nt0', swapId: 'sw0', toStaffName: '测试甲', title: '历史通知', detail: '隔离测试通知',
    result: 'rejected', createdAt: '2026-10-30 12:30', read: true,
  };
  current.notices.push(previousNotice);
  const pending = success(submit(current, input({ targetWeek: '下周' })));
  pending.roster.本周 = [];
  pending.roster.下周 = [];
  const updated = success(respond(freeze(pending), false));
  assert.equal(updated.roster, pending.roster);
  assert.equal(updated.swaps[0].reviewNote, '不方便，无法替班');
  assert.equal(updated.swaps[0].reviewedAt, '2026-10-31 12:30');
  assert.equal(updated.notices.length, 2);
  assert.equal(updated.notices[0].toStaffName, '测试甲');
  assert.equal(updated.notices[0].result, 'rejected');
  assert.equal(updated.notices[0].read, false);
  assert.equal(updated.notices[1], previousNotice);
});
