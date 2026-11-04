/**
 * 后端接口客户端。
 *
 * 所有接口对外使用 camelCase（后端 Pydantic 别名保证），因此这里不需要再做字段转换。
 * 未连接后端时组件仍使用本地演示数据，行为与此前完全一致。
 */

import type {
  Account,
  AttendanceRecord,
  CertificateFile,
  ExpectedChange,
  LeaveRecord,
  ReviewRecord,
  Shift,
  SwapNotice,
  SwapRequest,
} from '../types';

/** 后端地址：本地开发默认 http://127.0.0.1:8000 */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
/** 是否为 SMB 后端模式；置为 false 可强制回到纯前端演示 */
export const API_ENABLED = (import.meta.env.VITE_USE_API ?? 'true') !== 'false';

const TOKEN_KEY = 'access_token';

export type ApiStatus = 'off' | 'checking' | 'online' | 'offline';

export class ApiError extends Error {
  /** offline：连不上后端；http：后端返回了非 2xx */
  constructor(message: string, readonly kind: 'offline' | 'http' = 'http') {
    super(message);
    this.name = 'ApiError';
  }
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* file:// 下可能被禁用 */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readToken();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('无法连接后端服务，已切换为本地演示数据', 'offline');
  }
  if (resp.status === 401) writeToken(null);
  if (!resp.ok) {
    let message = `请求失败（${resp.status}）`;
    try {
      const body = (await resp.json()) as { detail?: string };
      if (body?.detail) message = body.detail;
    } catch {
      /* 忽略解析失败 */
    }
    throw new ApiError(message, 'http');
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

const get = <T,>(path: string, params?: Record<string, string | undefined>) => {
  const search = params
    ? '?' + Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
        .join('&')
    : '';
  return request<T>(`${path}${search}`);
};

/* ------------------------------------------------------------------ *
 * 健康探测
 * ------------------------------------------------------------------ */
/**
 * 探测后端是否可用。
 *
 * 后端冷启动（uvicorn + SQLAlchemy）通常要 2~6 秒，页面往往比它先就绪，
 * 所以默认重试 4 次、每次间隔 1.2 秒，避免「启动慢一点点就永久显示离线」。
 */
export async function probeHealth(retries = 4, intervalMs = 1200): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const resp = await fetch(`${API_BASE}/api/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) return true;
    } catch {
      /* 后端还没起来，继续重试 */
    }
    if (attempt < retries - 1) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, intervalMs);
      });
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 认证
 * ------------------------------------------------------------------ */
interface LoginResponse {
  accessToken: string;
  account: {
    username: string;
    role: Account['role'];
    name: string;
    title: string;
    enabled: boolean;
    mustChangePassword?: boolean;
    classId?: string | null;
    staffId?: string | null;
  };
}

export async function apiLogin(username: string, password: string): Promise<Account> {
  const data = await request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  writeToken(data.accessToken);
  return toAccount(data.account);
}

function toAccount(raw: LoginResponse['account']): Account {
  return {
    username: raw.username,
    password: '', // 后端不返回口令，前端本地校验不再需要
    role: raw.role,
    name: raw.name,
    title: raw.title,
    enabled: raw.enabled,
    mustChangePassword: raw.mustChangePassword ?? false,
    classId: raw.classId ?? undefined,
    staffId: raw.staffId ?? undefined,
  };
}

export const apiChangePassword = (oldPassword: string, newPassword: string) =>
  request<{ ok: boolean; message: string }>('/api/auth/password', {
    method: 'POST',
    body: JSON.stringify({ oldPassword, newPassword }),
  });

export const apiLogout = () => writeToken(null);

/* ------------------------------------------------------------------ *
 * 排班
 * ------------------------------------------------------------------ */
interface RawShift {
  id: string;
  week: '本周' | '下周';
  weekday: string;
  type: Shift['type'];
  staffIds: string[];
}

export interface RawRoster {
  current: RawShift[];
  next: RawShift[];
}

export const apiRoster = () => get<RawRoster>('/api/roster');

/** 基础数据快照里只需要考勤排次锚点，其余字段前端用本地 data.ts */
export interface BootstrapAnchor {
  verifyAnchorDate?: string;
  verifyRoundToday?: number;
}

export const apiBootstrap = () => get<BootstrapAnchor>('/api/meta/bootstrap');

/* ------------------------------------------------------------------ *
 * 考勤
 * ------------------------------------------------------------------ */
export interface RawCertificateFile {
  id: string;
  name: string;
  url?: string | null;
}

export interface RawLeave {
  id: string;
  studentName: string;
  studentId: string;
  reason: string;
  reasonDetail?: string | null;
  extraNote?: string | null;
  sharedCertificate?: boolean;
  certificateLate?: boolean;
  certificateFiles?: RawCertificateFile[];
  checked?: boolean;
  hasIssue?: boolean;
  issueDescription?: string | null;
  issueBy?: string | null;
}

export interface RawViolation {
  studentName: string;
  reviewFiles?: RawCertificateFile[];
  reviewAt?: string | null;
  reviewBy?: string | null;
}

export interface RawAttendance {
  id: string;
  classId: string;
  className: string;
  classroom: string;
  date: string;
  expected: number;
  actual: number;
  leaveCount: number;
  lateUploaded?: boolean;
  uploadedAt: string;
  numberIssue?: boolean;
  numberIssueNote?: string | null;
  numberIssueCancelled?: boolean;
  numberIssueBy?: string | null;
  leaves?: RawLeave[];
  phoneViolations?: RawViolation[];
}

export interface RawExpectedChange {
  id: string;
  classId: string;
  className: string;
  date: string;
  fromCount: number;
  toCount: number;
  reason: string;
  by: string;
  createdAt: string;
  acknowledged: boolean;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
}

export interface RawReview {
  id: string;
  date: string;
  classId: string;
  className: string;
  classroom: string;
  studentName: string;
  files?: RawCertificateFile[];
  at: string;
  by: string;
}

export interface RawSwap {
  id: string;
  staffId: string;
  staffName: string;
  targetStaffId: string;
  targetStaffName: string;
  week: '本周' | '下周';
  targetWeek: '本周' | '下周';
  fromWeekday: string;
  fromType: string;
  toWeekday: string;
  toType: string;
  reason: string;
  status: SwapRequest['status'];
  createdAt: string;
  reviewNote?: string | null;
  reviewedAt?: string | null;
}

export interface RawNotice {
  id: string;
  swapId: string;
  toStaffName: string;
  title: string;
  detail: string;
  result: 'approved' | 'rejected';
  createdAt: string;
  read: boolean;
}

/* ------------------------------------------------------------------ *
 * 转换器：后端 JSON → 前端 types.ts
 * ------------------------------------------------------------------ */
const files = (list?: RawCertificateFile[]): CertificateFile[] =>
  (list ?? []).map((f) => ({ id: f.id, name: f.name, url: absoluteUrl(f.url) ?? undefined }));

export function absoluteUrl(url?: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_BASE}${url}`;
}

export function toLeave(raw: RawLeave): LeaveRecord {
  return {
    id: raw.id,
    studentName: raw.studentName,
    studentId: raw.studentId,
    reason: raw.reason,
    reasonDetail: raw.reasonDetail ?? undefined,
    extraNote: raw.extraNote ?? undefined,
    sharedCertificate: raw.sharedCertificate ?? false,
    certificateLate: raw.certificateLate ?? false,
    certificateFiles: files(raw.certificateFiles),
    checked: raw.checked ?? false,
    hasIssue: raw.hasIssue ?? false,
    issueDescription: raw.issueDescription ?? undefined,
    issueBy: raw.issueBy ?? undefined,
  };
}

export function toAttendance(raw: RawAttendance): AttendanceRecord {
  return {
    id: raw.id,
    classId: raw.classId,
    className: raw.className,
    classroom: raw.classroom,
    date: raw.date,
    expected: raw.expected,
    actual: raw.actual,
    leaveCount: raw.leaveCount,
    lateUploaded: raw.lateUploaded ?? false,
    uploadedAt: raw.uploadedAt,
    numberIssue: raw.numberIssue ?? false,
    numberIssueNote: raw.numberIssueNote ?? undefined,
    numberIssueCancelled: raw.numberIssueCancelled ?? false,
    numberIssueBy: raw.numberIssueBy ?? undefined,
    leaves: (raw.leaves ?? []).map(toLeave),
    phoneViolations: (raw.phoneViolations ?? []).map((v) => ({
      studentName: v.studentName,
      reviewFiles: files(v.reviewFiles),
      reviewAt: v.reviewAt ?? undefined,
      reviewBy: v.reviewBy ?? undefined,
    })),
  };
}

export function toExpectedChange(raw: RawExpectedChange): ExpectedChange {
  return {
    id: raw.id,
    classId: raw.classId,
    className: raw.className,
    date: raw.date,
    from: raw.fromCount,
    to: raw.toCount,
    reason: raw.reason,
    by: raw.by,
    createdAt: raw.createdAt,
    acknowledged: raw.acknowledged,
    acknowledgedAt: raw.acknowledgedAt ?? undefined,
    acknowledgedBy: raw.acknowledgedBy ?? undefined,
  };
}

export function toReview(raw: RawReview): ReviewRecord {
  return {
    id: raw.id,
    date: raw.date,
    classId: raw.classId,
    className: raw.className,
    classroom: raw.classroom,
    studentName: raw.studentName,
    files: files(raw.files),
    at: raw.at,
    by: raw.by,
  };
}

export function toSwap(raw: RawSwap): SwapRequest {
  return {
    id: raw.id,
    staffId: raw.staffId,
    staffName: raw.staffName,
    week: raw.week,
    targetWeek: raw.targetWeek,
    fromWeekday: raw.fromWeekday,
    fromType: raw.fromType as SwapRequest['fromType'],
    toWeekday: raw.toWeekday,
    toType: raw.toType as SwapRequest['toType'],
    reason: raw.reason,
    status: raw.status,
    createdAt: raw.createdAt,
    targetStaffId: raw.targetStaffId,
    targetStaffName: raw.targetStaffName,
    reviewNote: raw.reviewNote ?? undefined,
    reviewedAt: raw.reviewedAt ?? undefined,
  };
}

export function toNotice(raw: RawNotice): SwapNotice {
  return {
    id: raw.id,
    swapId: raw.swapId,
    toStaffName: raw.toStaffName,
    title: raw.title,
    detail: raw.detail,
    result: raw.result,
    createdAt: raw.createdAt,
    read: raw.read,
  };
}

/* ------------------------------------------------------------------ *
 * 接口
 * ------------------------------------------------------------------ */
export const apiAttendance = (params: { date?: string; classId?: string } = {}) =>
  get<RawAttendance[]>('/api/attendance', params).then((list) => list.map(toAttendance));

export const apiSubmitAttendance = (body: {
  classId: string;
  date: string;
  expected: number;
  actual: number;
  leaves: {
    studentName: string;
    studentId: string;
    reason: string;
    reasonDetail?: string;
    extraNote?: string;
    sharedCertificate?: boolean;
    certificateLate?: boolean;
    certificateFileIds: string[];
  }[];
}) => request<RawAttendance>('/api/attendance/submit', { method: 'POST', body: JSON.stringify(body) })
  .then(toAttendance);

export const apiTogglePhoneViolation = (recordId: string, studentName: string) =>
  request<RawAttendance>(`/api/attendance/${recordId}/phone-violations`, {
    method: 'POST',
    body: JSON.stringify({ studentName }),
  }).then(toAttendance);

export const apiUploadReview = (recordId: string, studentName: string, fileIds: string[]) =>
  request<RawAttendance>(`/api/attendance/${recordId}/phone-violations/${encodeURIComponent(studentName)}/review`, {
    method: 'POST',
    body: JSON.stringify({ fileIds }),
  }).then(toAttendance);

export const apiVerifyLeave = (leaveId: string, body: {
  checked: boolean; hasIssue: boolean; issueDescription?: string;
}) => request<RawLeave>(`/api/attendance/leaves/${leaveId}/verify`, {
  method: 'POST', body: JSON.stringify(body),
}).then(toLeave);

export const apiExpectedChanges = (classId?: string) =>
  get<RawExpectedChange[]>('/api/attendance/expected-changes', { classId })
    .then((list) => list.map(toExpectedChange));

export const apiCreateExpectedChange = (body: { classId: string; toCount: number; reason: string }) =>
  request<RawExpectedChange>('/api/attendance/expected-changes', {
    method: 'POST', body: JSON.stringify(body),
  }).then(toExpectedChange);

export const apiAckExpectedChange = (id: string) =>
  request<RawExpectedChange>(`/api/attendance/expected-changes/${id}/acknowledge`, { method: 'POST' })
    .then(toExpectedChange);

export const apiReviews = (classId?: string) =>
  get<RawReview[]>('/api/attendance/reviews', { classId }).then((list) => list.map(toReview));

/* ------------------------------------------------------------------ *
 * 调班
 * ------------------------------------------------------------------ */
export const apiSwaps = (staffId: string) =>
  get<RawSwap[]>('/api/swaps', { staffId, mine: 'true' }).then((list) => list.map(toSwap));

export const apiCreateSwap = (body: Record<string, unknown>) =>
  request<RawSwap>('/api/swaps', { method: 'POST', body: JSON.stringify(body) }).then(toSwap);

export const apiRespondSwap = (id: string, agree: boolean, note?: string) =>
  request<RawSwap>(`/api/swaps/${id}/respond`, {
    method: 'POST', body: JSON.stringify({ agree, note }),
  }).then(toSwap);

export const apiNotices = (staffId?: string) =>
  get<RawNotice[]>('/api/swaps/notices', { staffId }).then((list) => list.map(toNotice));

export const apiReadNotice = (id: string) =>
  request<{ ok: boolean }>(`/api/swaps/notices/${id}/read`, { method: 'POST' });

/* ------------------------------------------------------------------ *
 * 系统配置（运维端）
 * ------------------------------------------------------------------ */
export const apiUpdateSetting = (key: string, value: string) =>
  request<{ ok: boolean; key: string; value: string }>('/api/ops/settings', {
    method: 'PUT', body: JSON.stringify({ key, value }),
  });

/* ------------------------------------------------------------------ *
 * 文件
 * ------------------------------------------------------------------ */
export async function apiUploadFile(file: File, ownerType: 'leave' | 'review'): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const data = await request<{ id: string; name: string; url: string }>(
    `/api/files/upload?owner_type=${ownerType}`, { method: 'POST', body: form });
  return data.id;
}

export const apiDeleteFile = (id: string) =>
  request<{ ok: boolean }>(`/api/files/${id}`, { method: 'DELETE' });
