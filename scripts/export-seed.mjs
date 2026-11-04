/**
 * 把前端 src/data.ts 里的业务基础数据导出为 JSON，供 Python 后端导入。
 *
 * 目的：保持"一份数据、两端共用"，避免手工转录造成班级名/干事名单漂移。
 * 用法：node scripts/export-seed.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outFile = resolve(root, 'backend/app/seed/seed_data.json');

const bundle = await build({
  entryPoints: [resolve(root, 'src/data.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'node',
});
const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

const {
  SCHOOL, COLLEGE, APP_VERSION,
  CLASSES, STAFF, CHECK_SHIFTS, PHONE_SHIFTS, VERIFY_GROUPS, ACCOUNTS,
  DEFAULT_LEAVE_REASONS, SPARE_CLASSROOM, SPARE_ROOM_LABEL,
  buildInitialAttendance, INITIAL_SWAP_REQUESTS,
  classroomForClass, weekdayOf, WEEK_RANGE, ATTENDANCE_HISTORY, TODAY,
} = mod;

const WEEKDAY_LABEL = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

/** 本周内某个星期对应的日期（周一为一周起点） */
function dateOfWeekday(weekday) {
  const today = new Date(`${TODAY}T00:00:00`);
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  const target = WEEKDAY_LABEL.indexOf(weekday); // 该数组以星期一为 0，偏移量就是下标
  const d = new Date(monday);
  d.setDate(monday.getDate() + target);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------- 教室 ----------------
// 源表《信息工程学院晚自习教室安排》的原始行顺序；未知教室排在末尾
const SOURCE_ROOM_ORDER = [
  '明理楼314', '明理楼316', '明理楼318', '明理楼317', '明理楼303',
  '明理楼324', '明理楼302', '明理楼301', '明理楼415',
];

const foundRooms = [];
for (const c of CLASSES) {
  if (!foundRooms.includes(c.classroom)) foundRooms.push(c.classroom);
}
if (!foundRooms.includes(SPARE_CLASSROOM)) foundRooms.push(SPARE_CLASSROOM);
for (const r of SOURCE_ROOM_ORDER) {
  if (!foundRooms.includes(r)) foundRooms.push(r);
}
const roomOrder = [
  ...SOURCE_ROOM_ORDER.filter((r) => foundRooms.includes(r)),
  ...foundRooms.filter((r) => !SOURCE_ROOM_ORDER.includes(r)),
];

// 每周二自动化 1、2 班改到 305：遍历有晚自习的星期，找出与默认教室不同的组合
const roomRules = [];
const extraRooms = [];
for (const weekday of ['星期一', '星期二', '星期三', '星期四', '星期日']) {
  const date = dateOfWeekday(weekday);
  for (const c of CLASSES) {
    const room = classroomForClass(c.id, date);
    if (room && room !== c.classroom) {
      roomRules.push({ weekday, classId: c.id, room });
      if (!roomOrder.includes(room) && !extraRooms.includes(room)) extraRooms.push(room);
    }
  }
}

const allRooms = [...roomOrder, ...extraRooms];
const rooms = allRooms.map((name, index) => ({
  id: `r${String(index + 1).padStart(2, '0')}`,
  name,
  college: COLLEGE,
  weeks: WEEK_RANGE,
  note: name === SPARE_CLASSROOM ? SPARE_ROOM_LABEL : null,
  sortOrder: index + 1,
}));
const roomIdByName = Object.fromEntries(rooms.map((r) => [r.name, r.id]));

const classes = CLASSES.map((c) => ({
  id: c.id,
  name: c.name,
  major: c.major,
  college: c.college,
  weeks: c.weeks,
  committeeName: c.committeeName,
  size: c.size,
  baseRoomId: roomIdByName[c.classroom],
}));

const rules = roomRules.map((r, i) => ({
  id: `cr${String(i + 1).padStart(2, '0')}`,
  weekday: r.weekday,
  classId: r.classId,
  roomId: roomIdByName[r.room],
}));

// ---------------- 干事 / 排班 / 假条核查 ----------------
const staff = STAFF.map((s) => ({ id: s.id, name: s.name, role: s.role, phone: s.phone }));

const shifts = [...CHECK_SHIFTS, ...PHONE_SHIFTS].map((s) => ({
  weekday: s.weekday,
  type: s.type,
  staffIds: s.staffIds,
}));

const verifyGroups = VERIFY_GROUPS.map((g) => ({
  id: g.id,
  seq: g.seq,
  leaderId: g.leaderId,
  memberIds: g.memberIds,
}));

// ---------------- 账号 ----------------
const accounts = ACCOUNTS.map((a) => ({
  username: a.username,
  password: a.password,
  role: a.role,
  name: a.name,
  title: a.title,
  classId: a.classId ?? null,
  staffId: a.staffId ?? null,
  enabled: a.enabled,
}));

// ---------------- 今日考勤种子 ----------------
const attendance = buildInitialAttendance(TODAY).map((rec, i) => ({
  id: `ar${String(i + 1).padStart(2, '0')}`,
  classId: rec.classId,
  className: rec.className,
  classroom: classroomForClass(rec.classId, TODAY),
  date: rec.date,
  expected: rec.expected,
  actual: rec.actual,
  leaveCount: rec.leaveCount,
  lateUploaded: !!rec.lateUploaded,
  uploadedAt: rec.uploadedAt,
  leaves: rec.leaves.map((l, li) => ({
    id: `lv${String(i + 1).padStart(2, '0')}${String(li + 1).padStart(2, '0')}`,
    studentName: l.studentName,
    studentId: l.studentId,
    reason: l.reason,
    reasonDetail: l.reasonDetail ?? null,
    extraNote: l.extraNote ?? null,
    sharedCertificate: !!l.sharedCertificate,
    certificateLate: !!l.certificateLate,
    checked: !!l.checked,
    hasIssue: !!l.hasIssue,
    issueDescription: l.issueDescription ?? null,
    issueBy: l.issueBy ?? null,
    certificateFiles: (l.certificateFiles ?? []).map((f, fi) => ({
      id: f.id || `cf${i}${li}${fi}`,
      name: f.name,
      dataUri: f.url ?? null,
    })),
  })),
  phoneViolations: [],
}));

// ---------------- 调班种子 ----------------
const swaps = INITIAL_SWAP_REQUESTS.map((s) => ({
  id: s.id,
  staffId: s.staffId,
  staffName: s.staffName,
  targetStaffId: s.targetStaffId,
  targetStaffName: s.targetStaffName,
  week: s.week ?? '本周',
  targetWeek: s.targetWeek ?? s.week ?? '本周',
  fromWeekday: s.fromWeekday,
  fromType: s.fromType,
  toWeekday: s.toWeekday,
  toType: s.toType,
  reason: s.reason,
  status: s.status,
  reviewNote: s.reviewNote ?? null,
  createdAt: s.createdAt,
  reviewedAt: s.reviewedAt ?? null,
}));

const history = ATTENDANCE_HISTORY.map((h) => ({ ...h }));

const payload = {
  meta: {
    school: SCHOOL,
    college: COLLEGE,
    frontendVersion: APP_VERSION,
    weekdayToday: weekdayOf(TODAY),
    exportedAt: new Date().toISOString(),
  },
  rooms,
  classes,
  classroomRules: rules,
  staff,
  shifts,
  verifyGroups,
  accounts,
  leaveReasons: DEFAULT_LEAVE_REASONS,
  attendance,
  swaps,
  history,
};

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf-8');

const sizeKb = (JSON.stringify(payload).length / 1024).toFixed(1);
console.log(`已导出 ${outFile}`);
console.log(
  `教室 ${rooms.length} · 班级 ${classes.length} · 教室例外规则 ${rules.length} · ` +
  `干事 ${staff.length} · 排班 ${shifts.length} · 账号 ${accounts.length} · ` +
  `今日考勤 ${attendance.length} 条 · 调班种子 ${swaps.length} · ${sizeKb} KB`,
);
if (rules.length) {
  console.log('教室例外：', rules.map((r) => `${r.weekday} ${r.classId} -> ${r.roomId}`).join('；'));
}
