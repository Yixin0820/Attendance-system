import type {
  Account,
  AttendanceRecord,
  ClassInfo,
  Classroom,
  LeaveRecord,
  Shift,
  ShiftType,
  Staff,
  SwapRequest,
  VerifyGroup,
} from './types';

/* ------------------------------------------------------------------ *
 * 基础信息
 * ------------------------------------------------------------------ */

export const SCHOOL = '明德理工学院';
/** 系统版本（首页、导出页脚与说明文档统一引用） */
export const APP_VERSION = 'v1.1.2';
export const COLLEGE = '信息工程学院';
export const DEPARTMENT = '学习部';

const WEEKDAY_LABEL = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

/* ------------------------------------------------------------------ *
 * 统一时间基准：北京时间（UTC+8）
 * 新疆本地设备常被设为 UTC+6「新疆时间」。若前端直接读设备本地时间，
 * 晚 20:00–23:00 的操作高峰会出现「前端仍是昨天、后端已是今天」的错位，
 * 导致考勤日期、查勤轮次、留痕时间与上传截止判断全部失准。
 * 后端 constants.py 已固定 UTC+8，这里同样只用绝对时间戳 + 固定偏移，
 * 结果不随用户设备或服务器时区设置变化。
 * ------------------------------------------------------------------ */
export const BUSINESS_TZ_OFFSET_HOURS = 8;
export const TIMEZONE_LABEL = '北京时间';

export interface BeijingParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 0 = 星期日 */
  weekday: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 把绝对时间戳换算为北京时间各分量（不读本地时区） */
export function beijingParts(at: number = Date.now()): BeijingParts {
  const shifted = new Date(at + BUSINESS_TZ_OFFSET_HOURS * 3_600_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
  };
}

/** 业务日期 YYYY-MM-DD（北京时间） */
export function beijingTodayStr(at: number = Date.now()): string {
  const p = beijingParts(at);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** 当前北京时间 HH:MM:SS */
export function beijingTimeStr(at: number = Date.now()): string {
  const p = beijingParts(at);
  return `${pad2(p.hours)}:${pad2(p.minutes)}:${pad2(p.seconds)}`;
}

/** 当前北京时间 YYYY-MM-DD HH:MM（留痕用） */
export function beijingStampStr(at: number = Date.now()): string {
  return `${beijingTodayStr(at)} ${beijingTimeStr(at).slice(0, 5)}`;
}

/** 今天（业务日期，历史查询 / 值班均以此为准） */
function todayStr(): string {
  return beijingTodayStr();
}

export function weekdayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return WEEKDAY_LABEL[(d.getUTCDay() + 6) % 7];
}

export const TODAY = todayStr();

/** 上传截止时间（北京时间） */
export const UPLOAD_DEADLINE = '20:59';

/** 有晚自习的星期（依据《晚自习查班表》） */
export const STUDY_WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期日'] as const;

/** 学期周次 */
export const WEEK_RANGE = '第 2-18 周';

/* ------------------------------------------------------------------ *
 * 教室与班级 —— 依据《信息工程学院晚自习教室安排》
 * ------------------------------------------------------------------ */

/** 备用教室行在表中填写的班级名（明理楼301 为学习部常用教室） */
export const SPARE_ROOM_LABEL = '学习部常用教室';

/**
 * 逐行照抄《信息工程学院晚自习教室安排》原表：
 * 教室 | 学院 | 班级 | 周次
 */
interface RawRoomRow {
  classroom: string;
  college: string;
  /** 班级名；等于 SPARE_ROOM_LABEL 时表示该教室无班级 */
  className: string;
  weeks: string;
}

const RAW_ROOM_ROWS: RawRoomRow[] = [
  { classroom: '明理楼314', college: '信息工程学院', className: '软件工程2026级1班', weeks: '第2-18周' },
  { classroom: '明理楼314', college: '信息工程学院', className: '软件工程2026级2班', weeks: '第2-18周' },
  { classroom: '明理楼316', college: '信息工程学院', className: '软件工程2026级3班', weeks: '第2-18周' },
  { classroom: '明理楼316', college: '信息工程学院', className: '软件工程2026级4班', weeks: '第2-18周' },
  { classroom: '明理楼318', college: '信息工程学院', className: '网络工程2026级1班', weeks: '第2-18周' },
  { classroom: '明理楼318', college: '信息工程学院', className: '网络工程2026级2班', weeks: '第2-18周' },
  { classroom: '明理楼317', college: '信息工程学院', className: '通信工程2026级1班', weeks: '第2-18周' },
  { classroom: '明理楼317', college: '信息工程学院', className: '通信工程2026级2班', weeks: '第2-18周' },
  { classroom: '明理楼303', college: '信息工程学院', className: '自动化2026级1班', weeks: '第2-18周' },
  { classroom: '明理楼303', college: '信息工程学院', className: '自动化2026级2班', weeks: '第2-18周' },
  { classroom: '明理楼324', college: '信息工程学院', className: '自动化2026级3班', weeks: '第2-18周' },
  { classroom: '明理楼324', college: '信息工程学院', className: '自动化2026级4班', weeks: '第2-18周' },
  { classroom: '明理楼302', college: '信息工程学院', className: '电气工程2026级1班', weeks: '第2-18周' },
  { classroom: '明理楼302', college: '信息工程学院', className: '电气工程2026级2班', weeks: '第2-18周' },
  { classroom: '明理楼301', college: '信息工程学院', className: SPARE_ROOM_LABEL, weeks: '第2-18周' },
  { classroom: '明理楼415', college: '信息工程学院', className: '人工智能2026级1班', weeks: '第2-18周' },
  { classroom: '明理楼415', college: '信息工程学院', className: '人工智能2026级2班', weeks: '第2-18周' },
];

/** 班级人数（应到基准）—— 原表未列，沿用系统既有值 */
const CLASS_SIZE: Record<string, number> = {
  软件工程2026级1班: 32,
  软件工程2026级2班: 31,
  软件工程2026级3班: 33,
  软件工程2026级4班: 32,
  网络工程2026级1班: 30,
  网络工程2026级2班: 30,
  通信工程2026级1班: 28,
  通信工程2026级2班: 29,
  自动化2026级1班: 34,
  自动化2026级2班: 33,
  自动化2026级3班: 34,
  自动化2026级4班: 33,
  电气工程2026级1班: 27,
  电气工程2026级2班: 28,
  人工智能2026级1班: 31,
  人工智能2026级2班: 30,
};

/** 班级简称，用于学委展示名与头像 */
export function shortClassName(name: string): string {
  const major = name.replace(/2026级/, '').replace(/\d+班$/, (m) => m);
  return major;
}

/** 由教室安排表推导班级列表（按表中出现顺序） */
export const CLASSES: ClassInfo[] = RAW_ROOM_ROWS.filter(
  (r) => r.className !== SPARE_ROOM_LABEL,
).map((r, i) => ({
  id: `k${String(i + 1).padStart(2, '0')}`,
  name: r.className,
  major: r.className.replace(/2026级\d+班$/, ''),
  classroom: r.classroom,
  college: r.college,
  weeks: r.weeks,
  committeeName: `${shortClassName(r.className)}学委`,
  size: CLASS_SIZE[r.className] ?? 30,
}));

export const CLASS_ID_BY_NAME: Record<string, string> = Object.fromEntries(
  CLASSES.map((c) => [c.name, c.id]),
);

/** 明理楼301 为学习部常用教室（备用教室） */
export const SPARE_CLASSROOM = '明理楼301';

/**
 * 按星期变化的教室例外：每周二自动化 1、2 班由明理楼303 调整到明理楼305。
 * 其余日期仍按教室安排表（303）执行。
 */
const ROOM_WEEKDAY_OVERRIDES: { weekday: string; className: string; classroom: string }[] = [
  { weekday: '星期二', className: '自动化2026级1班', classroom: '明理楼305' },
  { weekday: '星期二', className: '自动化2026级2班', classroom: '明理楼305' },
];

/** 某班在某天的实际晚自习教室 */
export function classroomForClass(classId: string, date = TODAY): string {
  const cls = CLASSES.find((c) => c.id === classId);
  if (!cls) return '';
  const weekday = weekdayOf(date);
  const override = ROOM_WEEKDAY_OVERRIDES.find((r) => r.weekday === weekday && r.className === cls.name);
  return override?.classroom ?? cls.classroom;
}

/** 某天的教室安排（含按星期生效的教室例外） */
export function classroomsForDate(date = TODAY): Classroom[] {
  const weekday = weekdayOf(date);
  const order: string[] = [];
  const grouped = new Map<string, string[]>();
  RAW_ROOM_ROWS.forEach((row) => {
    const override = ROOM_WEEKDAY_OVERRIDES.find((r) => r.weekday === weekday && r.className === row.className);
    const room = override?.classroom ?? row.classroom;
    if (!grouped.has(room)) {
      grouped.set(room, []);
      order.push(room);
    }
    if (row.className !== SPARE_ROOM_LABEL) {
      grouped.get(room)!.push(CLASS_ID_BY_NAME[row.className]);
    }
  });
  const baseWeeks = new Map(RAW_ROOM_ROWS.map((row) => [row.classroom, row.weeks]));
  return order.map((room) => {
    const classIds = grouped.get(room) ?? [];
    return {
      id: `r${room}`,
      name: room,
      classIds,
      college: COLLEGE,
      weeks: baseWeeks.get(room) ?? WEEK_RANGE,
      note: classIds.length === 0 ? SPARE_ROOM_LABEL : undefined,
    };
  });
}

/* ------------------------------------------------------------------ *
 * 学习部干事 —— 依据三份排班表去重汇总（共 27 人）
 * ------------------------------------------------------------------ */

const RAW_STAFF: { name: string; leader: boolean }[] = [
  { name: '王浩然', leader: false },
  { name: '李思远', leader: true },
  { name: '张子涵', leader: true },
  { name: '刘梓萱', leader: false },
  { name: '陈雨桐', leader: false },
  { name: '杨宇航', leader: false },
  { name: '赵欣怡', leader: false },
  { name: '黄俊杰', leader: false },
  { name: '周梦琪', leader: false },
  { name: '吴佳乐', leader: false },
  { name: '徐天磊', leader: false },
  { name: '孙若曦', leader: false },
  { name: '胡晨曦', leader: false },
  { name: '朱晓东', leader: false },
  { name: '高欣然', leader: false },
  { name: '林浩宇', leader: true },
  { name: '何雅静', leader: false },
  { name: '郭明轩', leader: true },
  { name: '罗诗涵', leader: false },
  { name: '宋佳音', leader: false },
  { name: '唐子墨', leader: true },
  { name: '韩雪松', leader: true },
  { name: '冯一鸣', leader: false },
  { name: '董思源', leader: false },
  { name: '萧雅婷', leader: false },
  { name: '程浩然', leader: false },
  { name: '潘悦宁', leader: false },
];

export const STAFF: Staff[] = RAW_STAFF.map((s, i) => ({
  id: `s${String(i + 1).padStart(2, '0')}`,
  name: s.name,
  role: s.leader ? '组长' : '干事',
  phone: `138****${String(i + 1).padStart(4, '0')}`,
}));

const staffByName = new Map(STAFF.map((s) => [s.name, s]));

export function staffIdOf(name: string): string {
  return staffByName.get(name)?.id ?? '';
}

/* ------------------------------------------------------------------ *
 * 排班表 —— 依据《晚自习查班表》
 *   表1 = 查班表（每天 7 人）
 *   表2 = 查手机表（每天 3 人）
 *   查考勤以《查考勤排班表》的七轮分组为准（见 VERIFY_GROUPS），没有星期映射，
 *   因此这里不再生成按星期的「考勤」排班，避免与查手机表重复。
 * ------------------------------------------------------------------ */

const CHECK_ROSTER: Record<string, string[]> = {
  星期一: ['王浩然', '杨宇航', '周梦琪', '孙若曦', '黄俊杰', '郭明轩', '何雅静'],
  星期二: ['李思远', '赵欣怡', '吴佳乐', '胡晨曦', '林浩宇', '宋佳音', '冯一鸣'],
  星期三: ['张子涵', '黄俊杰', '徐天磊', '刘梓萱', '何雅静', '潘悦宁', '董思源'],
  星期四: ['刘梓萱', '杨宇航', '张子涵', '朱晓东', '郭明轩', '唐子墨', '冯一鸣'],
  星期日: ['陈雨桐', '周梦琪', '吴佳乐', '高欣然', '罗诗涵', '韩雪松', '萧雅婷'],
};

/**
 * 表2 = 查手机表（每天 3 人）—— 依据《晚自习查班表》中的「查手机」
 */
const PHONE_ROSTER: Record<string, string[]> = {
  星期一: ['宋佳音', '罗诗涵', '程浩然'],
  星期二: ['唐子墨', '陈雨桐', '韩雪松'],
  星期三: ['林浩宇', '程浩然', '孙若曦'],
  星期四: ['李思远', '胡晨曦', '徐天磊'],
  星期日: ['朱晓东', '潘悦宁', '王浩然'],
};

function buildShifts(
  roster: Record<string, string[]>,
  type: ShiftType,
  prefix: string,
): Shift[] {
  return STUDY_WEEKDAYS.map((wd, i) => ({
    id: `${prefix}${i + 1}`,
    weekday: wd,
    type,
    staffIds: (roster[wd] ?? []).map(staffIdOf).filter(Boolean),
  }));
}

export const CHECK_SHIFTS: Shift[] = buildShifts(CHECK_ROSTER, '查班', 'chk');
export const PHONE_SHIFTS: Shift[] = buildShifts(PHONE_ROSTER, '查手机', 'phn');

/* ------------------------------------------------------------------ *
 * 假条核查分组 —— 依据《查考勤排班表》（第 1~7 次）
 * ------------------------------------------------------------------ */

const RAW_VERIFY_GROUPS: { leader: string; members: string[] }[] = [
  { leader: '李思远', members: ['王浩然', '孙若曦', '胡晨曦'] },
  { leader: '韩雪松', members: ['董思源', '冯一鸣', '程浩然'] },
  { leader: '郭明轩', members: ['陈雨桐', '黄俊杰', '何雅静'] },
  { leader: '唐子墨', members: ['吴佳乐', '刘梓萱', '徐天磊'] },
  { leader: '唐子墨', members: ['高欣然', '萧雅婷', '朱晓东'] },
  { leader: '林浩宇', members: ['杨宇航', '宋佳音', '赵欣怡'] },
  { leader: '张子涵', members: ['周梦琪', '罗诗涵', '潘悦宁'] },
];

export const VERIFY_GROUPS: VerifyGroup[] = RAW_VERIFY_GROUPS.map((g, i) => ({
  id: `vg${i + 1}`,
  seq: i + 1,
  leaderId: staffIdOf(g.leader),
  memberIds: g.members.map(staffIdOf).filter(Boolean),
}));

/* ------------------------------------------------------------------ *
 * 考勤排次 —— 「按次续排」
 *   《查考勤排班表》只给出「第一次～第七次」七套分组，没有日期或星期。
 *   规则：以「第一次」所在日期为锚点，之后每遇到一个有晚自习的日子就推进
 *   一轮，第七轮之后回到第一轮循环（没有晚自习的日子不占轮次）。
 *   长假 / 停课后若需要重新对齐，改锚点日期即可。
 * ------------------------------------------------------------------ */

/** 「第一次」所在的晚自习日期（锚点）。可在管理端「考勤排次」中修改。 */
export const DEFAULT_VERIFY_ANCHOR_DATE = '2026-11-01';

function addDays(date: string, days: number): string {
  // 用 UTC 解析与运算，纯日期计算不受设备时区 / 夏令时影响
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 该日期是否有晚自习 */
export function isStudyNight(date: string): boolean {
  return (STUDY_WEEKDAYS as readonly string[]).includes(weekdayOf(date));
}

/** 从 from（含）到 to（不含）之间的晚自习天数 */
function studyNightsBetween(from: string, to: string): number {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    if (isStudyNight(d)) n += 1;
  }
  return n;
}

/**
 * 某天的考勤轮次序号（1～7）。
 * 非晚自习日返回 0。锚点当天为第 1 次，之后每个晚自习日 +1，第七次后回到第一次。
 */
export function verifyRoundOf(date: string, anchor = DEFAULT_VERIFY_ANCHOR_DATE): number {
  if (!isStudyNight(date)) return 0;
  const delta = date >= anchor
    ? studyNightsBetween(anchor, date)
    : -studyNightsBetween(date, anchor);
  return ((delta % VERIFY_GROUPS.length) + VERIFY_GROUPS.length) % VERIFY_GROUPS.length + 1;
}

/** 某天负责查考勤的分组；非晚自习日返回 undefined */
export function verifyGroupOf(date: string, anchor = DEFAULT_VERIFY_ANCHOR_DATE): VerifyGroup | undefined {
  const round = verifyRoundOf(date, anchor);
  return round === 0 ? undefined : VERIFY_GROUPS[round - 1];
}

/** 从某天（含）起最近 count 个晚自习日的排次，用于展示「接下来几次是谁」 */
export function upcomingVerifyRounds(
  count = 7,
  from = TODAY,
  anchor = DEFAULT_VERIFY_ANCHOR_DATE,
): { date: string; seq: number; group: VerifyGroup }[] {
  const out: { date: string; seq: number; group: VerifyGroup }[] = [];
  let d = from;
  while (out.length < count) {
    if (isStudyNight(d)) {
      const seq = verifyRoundOf(d, anchor);
      out.push({ date: d, seq, group: VERIFY_GROUPS[seq - 1] });
    }
    d = addDays(d, 1);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 账号
 *   16 个班级 → 16 个学委账号
 *   27 名干事 → 27 个查勤账号
 *   1 个管理员 + 1 个运维
 * ------------------------------------------------------------------ */

export const DEFAULT_PASSWORD = '123456';

const committeeAccounts: Account[] = CLASSES.map((c, i) => ({
  username: `xw${String(i + 1).padStart(2, '0')}`,
  password: DEFAULT_PASSWORD,
  role: 'committee',
  name: c.committeeName,
  classId: c.id,
  title: `${c.name} · 学委`,
  enabled: true,
}));

const inspectorAccounts: Account[] = STAFF.map((s, i) => ({
  username: `gs${String(i + 1).padStart(2, '0')}`,
  password: DEFAULT_PASSWORD,
  role: 'inspector',
  name: s.name,
  staffId: s.id,
  title: `学习部 · ${s.role}`,
  enabled: true,
}));

const manageAccounts: Account[] = [
  {
    username: 'admin',
    password: DEFAULT_PASSWORD,
    role: 'admin',
    name: '管理员',
    title: `${COLLEGE} · 管理员`,
    enabled: true,
  },
  {
    username: 'ops',
    password: DEFAULT_PASSWORD,
    role: 'ops',
    name: '运维',
    title: '系统运维',
    enabled: true,
  },
];

export const ACCOUNTS: Account[] = [
  ...committeeAccounts,
  ...inspectorAccounts,
  ...manageAccounts,
];

/* ------------------------------------------------------------------ *
 * 请假类别
 * ------------------------------------------------------------------ */

/** 系统内置假条类别：仅「病假」「事假」（自定义标签可自行增删） */
export const DEFAULT_LEAVE_REASONS = ['病假', '事假'];

export const LEAVE_REASON_COLORS: Record<string, string> = {
  病假: 'bg-rose-50 text-rose-600 border-rose-100',
  事假: 'bg-amber-50 text-amber-600 border-amber-100',
  公假: 'bg-sky-50 text-sky-600 border-sky-100',
  实习: 'bg-blue-50 text-blue-600 border-blue-100',
  比赛: 'bg-violet-50 text-violet-600 border-violet-100',
  社团活动: 'bg-teal-50 text-teal-600 border-teal-100',
  其他: 'bg-ink-100 text-ink-600 border-ink-200',
};

export function reasonColor(reason: string): string {
  return LEAVE_REASON_COLORS[reason] ?? 'bg-brand-50 text-brand-600 border-brand-100';
}

/* ------------------------------------------------------------------ *
 * 假条图片（可点击放大）—— 用内联 SVG 生成占位假条
 * ------------------------------------------------------------------ */

export function makeCertificateImage(studentName: string, reason: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="760" viewBox="0 0 560 760">
  <rect width="560" height="760" fill="#fdfdfb"/>
  <rect x="24" y="24" width="512" height="712" fill="none" stroke="#d8d2c4" stroke-width="3"/>
  <text x="280" y="96" text-anchor="middle" font-family="serif" font-size="30" fill="#1f2937">请 假 条</text>
  <line x1="80" y1="120" x2="480" y2="120" stroke="#d8d2c4" stroke-width="2"/>
  <text x="72" y="196" font-family="sans-serif" font-size="22" fill="#374151">申请人：${studentName}</text>
  <text x="72" y="252" font-family="sans-serif" font-size="22" fill="#374151">类别：${reason}</text>
  <text x="72" y="308" font-family="sans-serif" font-size="22" fill="#374151">学院：${COLLEGE}</text>
  <text x="72" y="364" font-family="sans-serif" font-size="22" fill="#374151">日期：${TODAY}</text>
  <text x="72" y="440" font-family="sans-serif" font-size="20" fill="#4b5563">事由：本人因${reason}，无法参加当日晚自习，</text>
  <text x="72" y="480" font-family="sans-serif" font-size="20" fill="#4b5563">特此请假，恳请批准。</text>
  <circle cx="420" cy="600" r="72" fill="none" stroke="#b91c1c" stroke-width="4" opacity="0.75"/>
  <text x="420" y="606" text-anchor="middle" font-family="serif" font-size="20" fill="#b91c1c" opacity="0.85">学院公章</text>
  <text x="72" y="600" font-family="sans-serif" font-size="20" fill="#374151">辅导员签字：</text>
  <text x="72" y="672" font-family="sans-serif" font-size="18" fill="#6b7280">本图片为演示用占位假条</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ------------------------------------------------------------------ *
 * 今日考勤种子数据（演示用，可在页面上真实修改）
 * ------------------------------------------------------------------ */

const SEED_STUDENTS: Record<string, { name: string; sid: string }[]> = {
  k01: [
    { name: '张明', sid: '20260101' },
    { name: '刘悦', sid: '20260102' },
    { name: '陈浩', sid: '20260103' },
  ],
  k02: [
    { name: '李娜', sid: '20260201' },
    { name: '杨帆', sid: '20260202' },
  ],
  k03: [
    { name: '高远', sid: '20260301' },
    { name: '周舟', sid: '20260302' },
  ],
  k04: [
    { name: '孙琪', sid: '20260401' },
  ],
  k05: [
    { name: '宋茜', sid: '20260501' },
    { name: '范杰', sid: '20260502' },
  ],
  k06: [
    { name: '许诺', sid: '20260601' },
  ],
  k07: [
    { name: '夏白', sid: '20260701' },
    { name: '秋野', sid: '20260702' },
  ],
  k08: [
    { name: '冬也', sid: '20260801' },
  ],
  k09: [
    { name: '林夕', sid: '20260901' },
    { name: '江河', sid: '20260902' },
    { name: '吴桐', sid: '20260903' },
  ],
  k10: [
    { name: '白雪', sid: '20261001' },
    { name: '顾青', sid: '20261002' },
  ],
  k11: [
    { name: '沈亦', sid: '20261101' },
  ],
  k12: [
    { name: '韩雨', sid: '20261201' },
    { name: '孟凡', sid: '20261202' },
  ],
  k13: [
    { name: '袁州', sid: '20261301' },
  ],
  k14: [
    { name: '邓超', sid: '20261401' },
    { name: '曾毅', sid: '20261402' },
  ],
  k15: [
    { name: '彭程', sid: '20261501' },
    { name: '于洋', sid: '20261502' },
  ],
  k16: [
    { name: '苏晴', sid: '20261601' },
  ],
};

const SEED_PLAN: Record<string, { reason: string; detail: string; withCert: boolean; note?: string }[]> = {
  k01: [
    { reason: '病假', detail: '感冒发烧', withCert: true, note: '已联系家长确认' },
    { reason: '病假', detail: '感冒发烧', withCert: true },
    { reason: '比赛', detail: '校辩论赛', withCert: false },
  ],
  k02: [
    { reason: '病假', detail: '肠胃炎', withCert: true },
    { reason: '实习', detail: '企业实习', withCert: true },
  ],
  k03: [
    { reason: '社团活动', detail: '社团联排', withCert: true },
    { reason: '事假', detail: '家中有事', withCert: true },
  ],
  k04: [{ reason: '公假', detail: '学院材料报送', withCert: true }],
  k05: [
    { reason: '事假', detail: '驾校考试', withCert: false },
    { reason: '病假', detail: '发烧', withCert: false },
  ],
  k06: [{ reason: '比赛', detail: '省赛集训', withCert: true }],
  k07: [
    { reason: '比赛', detail: '省赛集训', withCert: true },
    { reason: '其他', detail: '个人事务', withCert: true },
  ],
  k08: [{ reason: '事假', detail: '医院复查', withCert: true }],
  k09: [
    { reason: '病假', detail: '急性肠胃炎', withCert: true },
    { reason: '病假', detail: '急性肠胃炎', withCert: true },
    { reason: '实习', detail: '校企实习', withCert: false },
  ],
  k10: [
    { reason: '社团活动', detail: '志愿服务', withCert: true },
    { reason: '事假', detail: '家中长辈住院', withCert: true, note: '情况特殊，已报辅导员' },
  ],
  k11: [{ reason: '公假', detail: '校级会议', withCert: true }],
  k12: [
    { reason: '病假', detail: '过敏', withCert: true },
    { reason: '实习', detail: '企业实习', withCert: true },
  ],
  k13: [{ reason: '其他', detail: '个人事务', withCert: false }],
  k14: [
    { reason: '事假', detail: '返乡', withCert: true },
    { reason: '比赛', detail: '数学建模', withCert: true },
  ],
  k15: [
    { reason: '社团活动', detail: '迎新晚会彩排', withCert: true },
    { reason: '社团活动', detail: '迎新晚会彩排', withCert: true },
  ],
  k16: [{ reason: '病假', detail: '感冒', withCert: true }],
};

function seedLeaves(classId: string): LeaveRecord[] {
  const students = SEED_STUDENTS[classId] ?? [];
  const plan = SEED_PLAN[classId] ?? [];
  return students.map((s, i) => {
    const p = plan[i] ?? { reason: '其他', detail: '个人事务', withCert: false };
    const files = p.withCert
      ? [
          {
            id: `${classId}-f${i}`,
            name: `${s.name}_${p.reason}假条.jpg`,
            url: makeCertificateImage(s.name, p.reason),
          },
        ]
      : [];
    return {
      id: `${classId}-l${i + 1}`,
      studentName: s.name,
      studentId: s.sid,
      reason: p.reason,
      reasonDetail: p.detail,
      extraNote: p.note,
      sharedCertificate: p.withCert,
      certificateLate: !p.withCert,
      certificateFiles: files,
      checked: false,
      hasIssue: false,
    };
  });
}

const UPLOAD_TIMES = ['20:31', '20:38', '20:42', '20:47', '20:50', '20:52', '20:55', '20:58', '21:06', '21:14', '20:35', '20:44', '20:49', '20:53', '20:57', '21:02'];

export function buildInitialAttendance(date = TODAY): AttendanceRecord[] {
  return CLASSES.map((c, i) => {
    const leaves = seedLeaves(c.id);
    const leaveCount = leaves.length;
    // 让其中两个班出现“人数核对不上”的情况，便于演示查班标记
    const mismatch = c.id === 'k05' || c.id === 'k11';
    const actual = c.size - leaveCount - (mismatch ? 1 : 0);
    const late = UPLOAD_TIMES[i] > UPLOAD_DEADLINE;
    return {
      classId: c.id,
      className: c.name,
      classroom: c.classroom,
      date,
      expected: c.size,
      actual,
      leaveCount,
      lateUploaded: late,
      uploadedAt: UPLOAD_TIMES[i % UPLOAD_TIMES.length],
      leaves,
      phoneViolations: [],
    };
  });
}

/* ------------------------------------------------------------------ *
 * 历史记录（仅有晚自习的日期）
 * ------------------------------------------------------------------ */

export interface HistoryEntry {
  date: string;
  weekday: string;
  totalExpected: number;
  totalActual: number;
  totalLeave: number;
  issues: number;
}

export const TOTAL_EXPECTED = CLASSES.reduce((s, c) => s + c.size, 0);

export const ATTENDANCE_HISTORY: HistoryEntry[] = [
  { date: '2026-10-26', weekday: '星期一', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 12, totalLeave: 12, issues: 2 },
  { date: '2026-10-25', weekday: '星期日', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 7, totalLeave: 7, issues: 1 },
  { date: '2026-10-22', weekday: '星期四', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 4, totalLeave: 4, issues: 0 },
  { date: '2026-10-21', weekday: '星期三', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 15, totalLeave: 15, issues: 3 },
  { date: '2026-10-20', weekday: '星期二', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 6, totalLeave: 6, issues: 1 },
  { date: '2026-10-19', weekday: '星期一', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 9, totalLeave: 9, issues: 2 },
  { date: '2026-10-18', weekday: '星期日', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 5, totalLeave: 5, issues: 0 },
  { date: '2026-10-15', weekday: '星期四', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 11, totalLeave: 11, issues: 1 },
  { date: '2026-10-14', weekday: '星期三', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 8, totalLeave: 8, issues: 0 },
  { date: '2026-10-13', weekday: '星期二', totalExpected: TOTAL_EXPECTED, totalActual: TOTAL_EXPECTED - 10, totalLeave: 10, issues: 2 },
];

/* ------------------------------------------------------------------ *
 * 调班申请种子
 * ------------------------------------------------------------------ */

export const INITIAL_SWAP_REQUESTS: SwapRequest[] = [
  {
    id: 'sw1',
    staffId: staffIdOf('郭明轩'),
    staffName: '郭明轩',
    fromWeekday: '星期一',
    fromType: '查班',
    toWeekday: '星期三',
    toType: '查班',
    reason: '周一有专业课程冲突，想请同学帮忙替班',
    status: 'pending',
    createdAt: '2026-10-26 18:20',
    targetStaffId: staffIdOf('何雅静'),
    targetStaffName: '何雅静',
  },
  {
    id: 'sw2',
    staffId: staffIdOf('唐子墨'),
    staffName: '唐子墨',
    fromWeekday: '星期四',
    fromType: '查班',
    toWeekday: '星期三',
    toType: '查班',
    reason: '周四需要参加校外实习面试',
    status: 'approved',
    createdAt: '2026-10-26 21:05',
    targetStaffId: staffIdOf('徐天磊'),
    targetStaffName: '徐天磊',
    reviewNote: '没问题，我来替你',
    reviewedAt: '2026-10-26 21:40',
  },
  {
    id: 'sw3',
    staffId: staffIdOf('程浩然'),
    staffName: '程浩然',
    fromWeekday: '星期一',
    fromType: '查手机',
    toWeekday: '星期三',
    toType: '查手机',
    reason: '周一有体能测试',
    status: 'pending',
    createdAt: '2026-10-27 09:12',
    targetStaffId: staffIdOf('孙若曦'),
    targetStaffName: '孙若曦',
  },
];

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 班级名单（用于「查手机」展示已到人员）
 * ------------------------------------------------------------------ */

const NAME_POOL = [
  '张明', '刘悦', '陈浩', '李娜', '杨帆', '高远', '周舟', '孙琪', '宋茜', '范杰',
  '许诺', '夏白', '秋野', '冬也', '林夕', '江河', '吴桐', '白雪', '顾青', '沈亦',
  '韩雨', '孟凡', '袁州', '邓超', '曾毅', '彭程', '于洋', '苏晴', '赵磊', '钱芳',
  '孙悦', '李强', '周敏', '吴静', '郑凯', '王芳', '冯雷', '陈晨', '褚亮', '卫平',
  '蒋涛', '沈洁', '韩梅', '杨光', '朱琳', '秦昊', '尤勇', '许静', '何伟', '吕燕',
  '施磊', '张超', '孔阳', '曹睿', '严宽', '华强', '金鑫', '魏然', '陶晶', '姜涛',
];

const rosterCache = new Map<string, string[]>();

/** 生成稳定的班级名单：优先放入学委上报的请假同学，其余用姓名池补足 */
export function rosterOf(classId: string, leaveNames: string[] = []): string[] {
  const key = `${classId}:${leaveNames.join(',')}`;
  const cached = rosterCache.get(key);
  if (cached) return cached;

  const cls = CLASSES.find((c) => c.id === classId);
  if (!cls) return [];

  const seed = seedLeaves(classId).map((l) => l.studentName);
  const base = [...new Set([...seed, ...leaveNames])];
  const used = new Set(base);
  const offset = classId.charCodeAt(1) * 7;
  let i = 0;
  while (base.length < cls.size && i < NAME_POOL.length * 2) {
    const n = NAME_POOL[(offset + i) % NAME_POOL.length];
    if (!used.has(n)) {
      used.add(n);
      base.push(n);
    }
    i += 1;
  }
  const roster = base.slice(0, cls.size);
  rosterCache.set(key, roster);
  return roster;
}

/** 当日已到人员名单（人数与实到数对齐） */
export function presentRoster(rec: AttendanceRecord): string[] {
  const leaveNames = new Set(rec.leaves.map((l) => l.studentName));
  let present = rosterOf(rec.classId).filter((n) => !leaveNames.has(n));
  if (present.length > rec.actual) present = present.slice(0, rec.actual);
  const filler = NAME_POOL.filter((n) => !present.includes(n) && !leaveNames.has(n));
  let f = 0;
  while (present.length < rec.actual && f < filler.length) {
    present.push(filler[f]);
    f += 1;
  }
  return present;
}

/** 干事头像取字：姓名 ≥3 字时取姓以外的一个字，否则取首字 */
export function avatarChar(name: string): string {
  if (!name) return '?';
  if (name.length >= 3) return name.slice(1, 2);
  return name.slice(0, 1);
}

/** 判断是否已上传 jpg/png 假条 */
export function hasImageCertificate(leave: LeaveRecord): boolean {
  return leave.certificateFiles.some((f) => /\.(jpg|jpeg|png)$/i.test(f.name));
}
