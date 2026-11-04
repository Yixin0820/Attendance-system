import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Account,
  AttendanceRecord,
  CertificateFile,
  ExpectedChange,
  LeaveRecord,
  PhoneViolation,
  ReviewRecord,
  Shift,
  SwapNotice,
  SwapRequest,
} from './types';
import {
  ACCOUNTS,
  CHECK_SHIFTS,
  INITIAL_SWAP_REQUESTS,
  PHONE_SHIFTS,
  STAFF,
  TODAY,
  DEFAULT_VERIFY_ANCHOR_DATE,
  beijingStampStr,
  beijingTimeStr,
  buildInitialAttendance,
} from './data';
import {
  createSwapRequest,
  getSwapWeeks,
  respondSwapRequest,
  type RosterState,
  type SwapInput,
} from './lib/roster';
import {
  API_ENABLED,
  ApiError,
  apiAckExpectedChange,
  apiAttendance,
  apiBootstrap,
  apiChangePassword,
  apiCreateExpectedChange,
  apiCreateSwap,
  apiExpectedChanges,
  apiLogin,
  apiNotices,
  apiReadNotice,
  apiRespondSwap,
  apiReviews,
  apiRoster,
  apiSubmitAttendance,
  apiSwaps,
  apiUpdateSetting,
  apiTogglePhoneViolation,
  apiUploadFile,
  apiUploadReview,
  apiVerifyLeave,
  probeHealth,
  readToken,
  writeToken,
  type ApiStatus,
} from './lib/api';

export interface LogEntry {
  id: string;
  time: string;
  user: string;
  action: string;
  target: string;
  level: 'info' | 'warn' | 'error';
}

export type ApiSignInResult =
  | { ok: true; account: Account }
  | { ok: false; offline: boolean; error?: string };

export interface Toast {
  id: string;
  text: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

interface Store {
  user: Account | null;
  login: (a: Account) => void;
  logout: () => void;

  /** 后端连接状态：off=未启用 checking=探测中 online=已连接 offline=连不上 */
  apiStatus: ApiStatus;
  /** 手动重新探测后端（后端启动慢于页面时用它刷新状态） */
  recheckBackend: () => Promise<boolean>;
  /** 是否已通过后端登录且服务可达（此时数据读写都走后端） */
  apiActive: boolean;
  /**
   * 通过后端登录。
   * - ok：已登录并从后端拉取全部数据
   * - offline：后端不可达，登录页应回退到本地校验
   * - error：账号或密码错误等真实失败原因
   */
  apiSignIn: (username: string, password: string) => Promise<ApiSignInResult>;


  /** 账号密码表（支持修改密码） */
  passwords: Record<string, string>;
  changePassword: (username: string, oldPwd: string, newPwd: string) => string | null;
  /** 记住密码：登录时读取 / 写入本地 */
  remembered: { username: string; password: string } | null;
  setRemembered: (v: { username: string; password: string } | null) => void;

  attendance: AttendanceRecord[];
  updateAttendance: (classId: string, patch: Partial<AttendanceRecord>) => void;
  submitAttendance: (classId: string, expected: number, actual: number, leaves: LeaveRecord[], late: boolean) => void;
  toggleNumberIssue: (classId: string, note: string, by: string) => void;
  cancelNumberIssue: (classId: string) => void;
  togglePhoneViolation: (classId: string, studentName: string) => void;
  uploadReview: (classId: string, studentName: string, files: CertificateFile[], by: string) => void;
  removeReviewFile: (classId: string, studentName: string, fileId: string) => void;
  updateLeave: (classId: string, leaveId: string, patch: Partial<LeaveRecord>) => void;

  /** 检讨存档（与考勤一样写入历史，可查询） */
  reviewHistory: ReviewRecord[];

  /** 应到人数变更留痕：修改后持续生效，直到下一次修改 */
  expectedChanges: ExpectedChange[];
  changeExpected: (classId: string, next: number, reason: string, by: string) => string | null;
  /** 管理端仅确认已阅，不审批、不回退人数 */
  acknowledgeExpectedChange: (id: string) => Promise<void>;

  /** 考勤排次锚点：「第一次」的日期。连上后端时以后端设置为准 */
  verifyAnchorDate: string;
  setVerifyAnchorDate: (date: string) => Promise<void>;

  /** 查班排班（每天 7 人） */
  checkShifts: Shift[];
  /** 查手机排班（每天 3 人）；查考勤为七轮分组，见 data.VERIFY_GROUPS */
  phoneShifts: Shift[];
  nextCheckShifts: Shift[];
  nextPhoneShifts: Shift[];
  /** classId -> 认领该班假条核查的干事姓名 */
  claimed: Record<string, string>;
  claimClasses: (classIds: string[], staffName: string) => void;

  swaps: SwapRequest[];
  requestSwap: (r: SwapInput) => boolean;
  /** 被选中的替班同学回应：agree 同意 / reject 不同意，两种情况都会通知发起人 */
  respondSwap: (id: string, agree: boolean, note?: string) => boolean;
  notices: SwapNotice[];
  markNoticeRead: (id: string) => void;
  resetRoster: () => void;

  logs: LogEntry[];
  pushLog: (action: string, target: string, level?: LogEntry['level']) => void;

  toasts: Toast[];
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

const StoreContext = createContext<Store | null>(null);

const REMEMBER_KEY = 'remembered_account';
/** 应到人数变更的本机持久键；正式后端建成前仅保存在当前浏览器 */
const EXPECTED_KEY = 'expected_changes';
/** 考勤排次锚点（「第一次」的日期）。连上后端时以后端为准 */
const ANCHOR_KEY = 'verify_anchor_date';

function loadExpectedChanges(): ExpectedChange[] {
  try {
    const raw = localStorage.getItem(EXPECTED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExpectedChange[]) : [];
  } catch {
    return [];
  }
}

function saveExpectedChanges(list: ExpectedChange[]) {
  try {
    localStorage.setItem(EXPECTED_KEY, JSON.stringify(list));
  } catch {
    /* file:// 下可能被禁用，忽略 */
  }
}

function loadAnchorDate(): string {
  try {
    return localStorage.getItem(ANCHOR_KEY) || DEFAULT_VERIFY_ANCHOR_DATE;
  } catch {
    return DEFAULT_VERIFY_ANCHOR_DATE;
  }
}

function saveAnchorDate(value: string) {
  try {
    if (value && value !== DEFAULT_VERIFY_ANCHOR_DATE) localStorage.setItem(ANCHOR_KEY, value);
    else localStorage.removeItem(ANCHOR_KEY);
  } catch {
    /* file:// 下可能被禁用，忽略 */
  }
}

function loadRemembered(): { username: string; password: string } | null {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    return raw ? (JSON.parse(raw) as { username: string; password: string }) : null;
  } catch {
    return null;
  }
}

function saveRemembered(v: { username: string; password: string } | null) {
  try {
    if (v) localStorage.setItem(REMEMBER_KEY, JSON.stringify(v));
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* file:// 下可能被禁用，忽略 */
  }
}

/** 统一使用北京时间留痕，避免新疆等 UTC+6 设备与后端时间错位 */
function nowTime(): string {
  return beijingTimeStr();
}

function nowStamp(): string {
  return beijingStampStr();
}

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

/** 后端附件 id 是 24 位十六进制；前端演示用的占位文件是短 id，不需要重复上传 */
function isServerFileId(id: string): boolean {
  return /^[0-9a-f]{24}$/i.test(id);
}

/** 恢复本机保存的应到人数变更：最后一次修改持续生效，直到下一次修改 */
function buildInitialState(): { attendance: AttendanceRecord[]; changes: ExpectedChange[] } {
  const changes = loadExpectedChanges();
  const latest = new Map<string, ExpectedChange>();
  changes.forEach((change) => {
    if (!latest.has(change.classId)) latest.set(change.classId, change);
  });
  const attendance = buildInitialAttendance().map((record) => {
    const change = latest.get(record.classId);
    return change ? { ...record, expected: change.to } : record;
  });
  return { attendance, changes };
}

function initialRoster(): RosterState['roster'] {
  const clone = () => [...CHECK_SHIFTS, ...PHONE_SHIFTS]
    .map((s) => ({ ...s, staffIds: [...s.staffIds] }));
  return { 本周: clone(), 下周: clone() };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>(() =>
    Object.fromEntries(ACCOUNTS.map((a) => [a.username, a.password])),
  );
  const [remembered, setRememberedState] = useState<{ username: string; password: string } | null>(() =>
    loadRemembered(),
  );
  const [initial] = useState(buildInitialState);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(initial.attendance);
  const [rosterState, setRosterState] = useState<RosterState>(() => ({
    roster: initialRoster(),
    swaps: INITIAL_SWAP_REQUESTS,
    notices: [],
  }));
  // 同一批事件中连续调用也使用最新业务状态，避免重复 pending 或重复回应。
  const rosterStateRef = useRef(rosterState);
  const commitRosterState = useCallback((next: RosterState) => {
    rosterStateRef.current = next;
    setRosterState(next);
  }, []);
  const { swaps, notices } = rosterState;
  const { checkShifts, phoneShifts, nextCheckShifts, nextPhoneShifts } = useMemo(() => ({
    checkShifts: rosterState.roster.本周.filter((s) => s.type === '查班'),
    phoneShifts: rosterState.roster.本周.filter((s) => s.type === '查手机'),
    nextCheckShifts: rosterState.roster.下周.filter((s) => s.type === '查班'),
    nextPhoneShifts: rosterState.roster.下周.filter((s) => s.type === '查手机'),
  }), [rosterState.roster]);
  const [claimed, setClaimed] = useState<Record<string, string>>({});
  const [verifyAnchorDate, setAnchorState] = useState<string>(loadAnchorDate);
  const [expectedChanges, setExpectedChanges] = useState<ExpectedChange[]>(initial.changes);
  const [reviewHistory, setReviewHistory] = useState<ReviewRecord[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushLog = useCallback(
    (action: string, target: string, level: LogEntry['level'] = 'info') => {
      setLogs((p) =>
        [
          {
            id: uid('log'),
            time: nowTime(),
            user: user?.name ?? '系统',
            action,
            target,
            level,
          },
          ...p,
        ].slice(0, 100),
      );
    },
    [user],
  );

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = uid('t');
    setToasts((p) => [...p, { id, text, tone }]);
    window.setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 2600);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);

  /* ---------------------------------------------------------------- *
   * 后端接入：连得上就走 API，连不上自动回退本地演示数据
   * ---------------------------------------------------------------- */
  const [apiStatus, setApiStatus] = useState<ApiStatus>(API_ENABLED ? 'checking' : 'off');
  const [apiToken, setApiToken] = useState<string | null>(() => (API_ENABLED ? readToken() : null));
  const apiActive = apiStatus === 'online' && !!apiToken;
  /** classId -> 后端考勤记录 id（后端接口按记录 id 操作，本地 AttendanceRecord 没有 id 字段） */
  const recordIds = useRef<Record<string, string>>({});

  const clearToken = useCallback((token: string | null) => {
    setApiToken(token);
    writeToken(token);
  }, []);

  /** 手动重连：后端启动慢于页面时，点一次就能从「离线」切到「已连接」 */
  const recheckBackend = useCallback(async () => {
    if (!API_ENABLED) return false;
    setApiStatus('checking');
    const ok = await probeHealth();
    setApiStatus(ok ? 'online' : 'offline');
    return ok;
  }, []);

  useEffect(() => {
    if (!API_ENABLED) return undefined;
    let alive = true;
    probeHealth().then((ok) => {
      if (alive) setApiStatus(ok ? 'online' : 'offline');
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 已在本机生效的改动同步到后端；失败时提示，但不打断演示流程 */
  const syncGuard = useCallback(
    (label: string, task: () => Promise<unknown>) => {
      if (!apiActive) return;
      task().catch((error: unknown) => {
        toast(
          `${label}：后端同步失败（${error instanceof Error ? error.message : '未知错误'}）`,
          'warning',
        );
      });
    },
    [apiActive, toast],
  );

  /** 修改考勤排次锚点：先落到本机保证界面即时生效，再同步后端 */
  const setVerifyAnchorDate = useCallback(
    async (date: string) => {
      setAnchorState(date);
      saveAnchorDate(date);
      if (!apiActive) return;
      try {
        await apiUpdateSetting('verifyAnchorDate', date);
      } catch (error) {
        toast(
          `排次锚点：后端同步失败（${error instanceof Error ? error.message : '未知错误'}）`,
          'warning',
        );
      }
    },
    [apiActive, toast],
  );

  /** 登录成功后一次性拉取：排班、当日考勤、应到变更、检讨存档、调班与通知 */
  const hydrateFromServer = useCallback(
    async (account: Account) => {
      const [roster, records, changes, reviews, noticeList, swaps, bootstrap] = await Promise.all([
        apiRoster(),
        apiAttendance({ date: TODAY }),
        apiExpectedChanges(),
        apiReviews(),
        apiNotices(account.staffId),
        apiSwaps(account.staffId ?? ''),
        apiBootstrap(),
      ]);
      if (bootstrap.verifyAnchorDate) setVerifyAnchorDate(bootstrap.verifyAnchorDate);
      const toShifts = (list: { id: string; weekday: string; type: Shift['type']; staffIds: string[] }[]) =>
        list.map((s) => ({ id: s.id, weekday: s.weekday, type: s.type, staffIds: s.staffIds }));

      recordIds.current = Object.fromEntries(
        records.filter((r) => r.id).map((r) => [r.classId, r.id as string]),
      );
      setAttendance((prev) => {
        const byClass = new Map(records.map((r) => [r.classId, r]));
        const merged = prev.map((r) => byClass.get(r.classId) ?? r);
        records.forEach((r) => {
          if (!prev.some((item) => item.classId === r.classId)) merged.push(r);
        });
        return merged;
      });
      setExpectedChanges(changes);
      setReviewHistory(reviews);
      commitRosterState({
        roster: { 本周: toShifts(roster.current), 下周: toShifts(roster.next) },
        swaps,
        notices: noticeList,
      });
    },
    [commitRosterState, setVerifyAnchorDate],
  );

  const apiSignIn = useCallback(
    async (username: string, password: string): Promise<ApiSignInResult> => {
      try {
        const account = await apiLogin(username, password);
        setUser(account);
        clearToken(readToken());
        setApiStatus('online');
        // 首次登录须改密时后端业务接口一律返回 423，此时不要拉数据；
        // 登录页会弹出不可关闭的改密弹窗，改密成功后用新口令重新登录再 hydrate。
        if (!account.mustChangePassword) await hydrateFromServer(account);
        return { ok: true, account };
      } catch (error) {
        if (error instanceof ApiError && error.kind === 'offline') {
          setApiStatus('offline');
          return { ok: false, offline: true };
        }
        return { ok: false, offline: false, error: error instanceof Error ? error.message : '登录失败' };
      }
    },
    [clearToken, hydrateFromServer],
  );

  const login = useCallback((a: Account) => setUser(a), []);
  const logout = useCallback(() => {
    setUser(null);
    clearToken(null);
  }, [clearToken]);

  const setRemembered = useCallback((v: { username: string; password: string } | null) => {
    setRememberedState(v);
    saveRemembered(v);
  }, []);

  const changePassword = useCallback(
    (username: string, oldPwd: string, newPwd: string): string | null => {
      const key = Object.keys(passwords).find((u) => u.toLowerCase() === username.trim().toLowerCase());
      if (!key) return '账号不存在';
      if (!apiActive && passwords[key] !== oldPwd) return '原密码不正确';
      if (!newPwd || newPwd.length < 6) return '新密码至少 6 位';
      // 后端模式下由服务端校验原密码，前端只负责提交与后续记忆
      if (apiActive) {
        syncGuard('修改密码', async () => {
          await apiChangePassword(oldPwd, newPwd);
          toast('密码已更新，请使用新密码登录', 'success');
        });
        setRemembered({ username: key, password: newPwd });
        return null;
      }
      setPasswords((p) => ({ ...p, [key]: newPwd }));
      saveRemembered(
        remembered && remembered.username === key
          ? { username: key, password: newPwd }
          : remembered,
      );
      setRememberedState(
        remembered && remembered.username === key
          ? { username: key, password: newPwd }
          : remembered,
      );
      return null;
    },
    [passwords, remembered, apiActive, syncGuard, setRemembered, toast],
  );

  const updateAttendance = useCallback((classId: string, patch: Partial<AttendanceRecord>) => {
    setAttendance((p) => p.map((r) => (r.classId === classId ? { ...r, ...patch } : r)));
  }, []);

  const submitAttendance = useCallback(
    (classId: string, expected: number, actual: number, leaves: LeaveRecord[], late: boolean) => {
      setAttendance((p) =>
        p.map((r) =>
          r.classId === classId
            ? {
                ...r,
                expected,
                actual,
                leaves,
                leaveCount: leaves.length,
                lateUploaded: late,
                uploadedAt: nowTime().slice(0, 5),
              }
            : r,
        ),
      );
      pushLog(late ? '补传考勤' : '上报考勤', classId, late ? 'warn' : 'info');
      if (!apiActive) return;
      void (async () => {
        try {
          const payload: Parameters<typeof apiSubmitAttendance>[0]['leaves'] = [];
          for (const l of leaves) {
            const fileIds: string[] = [];
            for (const f of l.certificateFiles ?? []) {
              if (f.file) fileIds.push(await apiUploadFile(f.file, 'leave'));
              else if (isServerFileId(f.id)) fileIds.push(f.id);
            }
            payload.push({
              studentName: l.studentName,
              studentId: l.studentId,
              reason: l.reason,
              reasonDetail: l.reasonDetail,
              extraNote: l.extraNote,
              sharedCertificate: l.sharedCertificate,
              certificateLate: l.certificateLate,
              certificateFileIds: fileIds,
            });
          }
          const saved = await apiSubmitAttendance({
            classId, date: TODAY, expected, actual, leaves: payload,
          });
          if (saved.id) recordIds.current[classId] = saved.id;
          setAttendance((p) => p.map((r) => (r.classId === classId ? { ...r, ...saved } : r)));
        } catch (error) {
          toast(`考勤上报：后端同步失败（${error instanceof Error ? error.message : '未知错误'}）`, 'warning');
        }
      })();
    },
    [pushLog, apiActive, toast],
  );

  const toggleNumberIssue = useCallback(
    (classId: string, note: string, by: string) => {
      setAttendance((p) =>
        p.map((r) =>
          r.classId === classId
            ? {
                ...r,
                numberIssue: !r.numberIssue,
                numberIssueNote: r.numberIssue ? r.numberIssueNote : note,
                numberIssueCancelled: false,
                numberIssueBy: by,
              }
            : r,
        ),
      );
    },
    [],
  );

  const cancelNumberIssue = useCallback((classId: string) => {
    setAttendance((p) =>
      p.map((r) =>
        r.classId === classId
          ? { ...r, numberIssue: false, numberIssueCancelled: true, numberIssueNote: undefined }
          : r,
      ),
    );
  }, []);

  /**
   * 学委修改应到人数：必须填写原因，修改后持续生效直到下一次修改。
   * 只新增留痕记录并更新当日应到，不回写或覆盖已上报的历史考勤。
   */
  const changeExpected = useCallback(
    (classId: string, next: number, reason: string, by: string): string | null => {
      const trimmed = reason.trim();
      if (!Number.isInteger(next) || next < 0) return '应到人数必须是 0 或正整数';
      if (!trimmed) return '请填写应到人数修改原因';
      const record = attendance.find((r) => r.classId === classId);
      if (!record) return '班级不存在';
      if (record.expected === next) return '应到人数未变化，无需修改';
      const change: ExpectedChange = {
        id: uid('ex'),
        classId,
        className: record.className,
        date: TODAY,
        from: record.expected,
        to: next,
        reason: trimmed,
        by,
        createdAt: nowStamp(),
        acknowledged: false,
      };
      setAttendance((p) => p.map((r) => (r.classId === classId ? { ...r, expected: next } : r)));
      setExpectedChanges((p) => {
        const nextList = [change, ...p];
        saveExpectedChanges(nextList);
        return nextList;
      });
      pushLog('修改应到人数', `${record.className} ${record.expected} → ${next}`, 'warn');
      if (apiActive) {
        syncGuard('应到人数修改', async () => {
          const saved = await apiCreateExpectedChange({ classId, toCount: next, reason: trimmed });
          setExpectedChanges((p) => [saved, ...p.filter((c) => c.id !== saved.id)]);
        });
      }
      return null;
    },
    [attendance, pushLog, apiActive, syncGuard],
  );

  /** 管理端确认已阅：留痕，不审批、不回退人数 */
  const acknowledgeExpectedChange = useCallback(
    async (id: string): Promise<void> => {
      const at = nowStamp();
      setExpectedChanges((p) => {
        const nextList = p.map((c) =>
          c.id === id
            ? { ...c, acknowledged: true, acknowledgedAt: at, acknowledgedBy: user?.name ?? '管理员' }
            : c,
        );
        saveExpectedChanges(nextList);
        return nextList;
      });
      pushLog('确认应到人数变更已阅', id, 'info');
      if (!apiActive) return;
      try {
        const saved = await apiAckExpectedChange(id);
        setExpectedChanges((p) => p.map((c) => (c.id === id ? saved : c)));
      } catch (error) {
        toast(`确认已阅：后端同步失败（${error instanceof Error ? error.message : '未知错误'}）`, 'warning');
      }
    },
    [pushLog, user, apiActive, toast],
  );

  const togglePhoneViolation = useCallback(
    (classId: string, studentName: string) => {
      setAttendance((p) =>
        p.map((r) => {
          if (r.classId !== classId) return r;
          const list: PhoneViolation[] = r.phoneViolations ?? [];
          const exists = list.some((v) => v.studentName === studentName);
          const next = exists
            ? list.filter((v) => v.studentName !== studentName)
            : [...list, { studentName }];
          return { ...r, phoneViolations: next };
        }),
      );
      const recordId = recordIds.current[classId];
      if (apiActive && recordId) {
        syncGuard('玩手机名单', async () => {
          const saved = await apiTogglePhoneViolation(recordId, studentName);
          setAttendance((p) => p.map((r) => (r.classId === classId ? { ...r, ...saved } : r)));
        });
      }
    },
    [apiActive, syncGuard],
  );

  const uploadReview = useCallback(
    (classId: string, studentName: string, files: CertificateFile[], by: string) => {
      if (files.length === 0) return;
      const at = nowTime().slice(0, 5);
      setAttendance((p) =>
        p.map((r) => {
          if (r.classId !== classId) return r;
          const list: PhoneViolation[] = r.phoneViolations ?? [];
          const next = list.map((v) =>
            v.studentName === studentName
              ? { ...v, reviewFiles: [...(v.reviewFiles ?? []), ...files], reviewAt: at, reviewBy: by }
              : v,
          );
          return { ...r, phoneViolations: next };
        }),
      );
      const rec = attendance.find((r) => r.classId === classId);
      setReviewHistory((p) => [
        {
          id: uid('rv'),
          date: TODAY,
          classId,
          className: rec?.className ?? classId,
          classroom: rec?.classroom ?? '',
          studentName,
          files,
          at,
          by,
        },
        ...p,
      ]);
      const recordId = recordIds.current[classId];
      if (apiActive && recordId) {
        syncGuard('检讨上传', async () => {
          const fileIds: string[] = [];
          for (const f of files) {
            if (f.file) fileIds.push(await apiUploadFile(f.file, 'review'));
            else if (isServerFileId(f.id)) fileIds.push(f.id);
          }
          const saved = await apiUploadReview(recordId, studentName, fileIds);
          setAttendance((p) => p.map((r) => (r.classId === classId ? { ...r, ...saved } : r)));
          setReviewHistory((p) =>
            saved.phoneViolations?.some((v) => v.studentName === studentName)
              ? p
              : p,
          );
        });
      }
    },
    [attendance, apiActive, syncGuard],
  );

  const removeReviewFile = useCallback((classId: string, studentName: string, fileId: string) => {
    setAttendance((p) =>
      p.map((r) => {
        if (r.classId !== classId) return r;
        const next = (r.phoneViolations ?? []).map((v) =>
          v.studentName === studentName
            ? { ...v, reviewFiles: (v.reviewFiles ?? []).filter((f) => f.id !== fileId) }
            : v,
        );
        return { ...r, phoneViolations: next };
      }),
    );
  }, []);

  const updateLeave = useCallback(
    (classId: string, leaveId: string, patch: Partial<LeaveRecord>) => {
      setAttendance((p) =>
        p.map((r) =>
          r.classId === classId
            ? {
                ...r,
                leaves: r.leaves.map((l) => (l.id === leaveId ? { ...l, ...patch } : l)),
              }
            : r,
        ),
      );
      if (apiActive && !patch.id) {
        syncGuard('假条核查', async () => {
          const saved = await apiVerifyLeave(leaveId, {
            checked: patch.checked ?? true,
            hasIssue: patch.hasIssue ?? false,
            issueDescription: patch.issueDescription,
          });
          setAttendance((p) =>
            p.map((r) =>
              r.classId === classId
                ? { ...r, leaves: r.leaves.map((l) => (l.id === leaveId ? saved : l)) }
                : r,
            ),
          );
        });
      }
    },
    [apiActive, syncGuard],
  );

  const claimClasses = useCallback((classIds: string[], staffName: string) => {
    setClaimed((p) => {
      const next = { ...p };
      classIds.forEach((id) => {
        next[id] = staffName;
      });
      return next;
    });
  }, []);

  const requestSwap = useCallback(
    (r: SwapInput) => {
      const result = createSwapRequest(rosterStateRef.current, r, user, STAFF, {
        id: uid('sw'), createdAt: nowStamp(),
      });
      if (!result.ok) {
        toast(result.error, 'warning');
        return false;
      }
      const { week, targetWeek } = getSwapWeeks(r);
      const label = `向 ${r.targetStaffName} 申请${week} → ${targetWeek}调班`;
      if (!apiActive) {
        commitRosterState(result.state);
        pushLog('提交调班申请', label, 'warn');
        return true;
      }
      // 连上后端时以服务端为准，避免本地 id 与服务端 id 重复占位
      void (async () => {
        try {
          const saved = await apiCreateSwap({
            staffId: r.staffId,
            staffName: r.staffName,
            targetStaffId: r.targetStaffId,
            targetStaffName: r.targetStaffName,
            week: r.week ?? '本周',
            targetWeek: r.targetWeek ?? r.week ?? '本周',
            fromWeekday: r.fromWeekday,
            fromType: r.fromType,
            toWeekday: r.toWeekday,
            toType: r.toType,
            reason: r.reason,
          });
          commitRosterState({
            ...rosterStateRef.current,
            swaps: [saved, ...rosterStateRef.current.swaps],
          });
          pushLog('提交调班申请', label, 'warn');
          toast('调班申请已提交，等待对方回应', 'success');
        } catch (error) {
          toast(`调班申请：${error instanceof Error ? error.message : '提交失败'}`, 'warning');
        }
      })();
      return true;
    },
    [user, commitRosterState, pushLog, toast, apiActive],
  );

  const respondSwap = useCallback(
    (id: string, agree: boolean, note?: string) => {
      const result = respondSwapRequest(rosterStateRef.current, id, agree, user, {
        noticeId: uid('nt'), reviewedAt: nowStamp(), note,
      });
      if (!result.ok) {
        toast(result.error, 'warning');
        return false;
      }
      if (!apiActive) {
        commitRosterState(result.state);
        pushLog(agree ? '同意调班申请' : '拒绝调班申请', result.state.notices[0].toStaffName, 'warn');
        return true;
      }
      void (async () => {
        try {
          const saved = await apiRespondSwap(id, agree, note);
          // 同意会改动排班，直接以服务端排班为准刷新本周与下周
          const roster = await apiRoster();
          const notices = await apiNotices(user?.staffId);
          const toShifts = (list: { id: string; weekday: string; type: Shift['type']; staffIds: string[] }[]) =>
            list.map((s) => ({ id: s.id, weekday: s.weekday, type: s.type, staffIds: s.staffIds }));
          commitRosterState({
            roster: { 本周: toShifts(roster.current), 下周: toShifts(roster.next) },
            swaps: rosterStateRef.current.swaps.map((s) => (s.id === id ? saved : s)),
            notices,
          });
          pushLog(agree ? '同意调班申请' : '拒绝调班申请', saved.staffName, 'warn');
          toast(agree ? '已同意，双方排班已互换' : '已拒绝，排班表保持不变', 'success');
        } catch (error) {
          toast(`调班回应：${error instanceof Error ? error.message : '操作失败'}`, 'warning');
        }
      })();
      return true;
    },
    [user, commitRosterState, pushLog, toast, apiActive],
  );

  const markNoticeRead = useCallback((id: string) => {
    const current = rosterStateRef.current;
    commitRosterState({
      ...current,
      notices: current.notices.map((n) => n.id === id ? { ...n, read: true } : n),
    });
    if (apiActive) syncGuard('通知已读', () => apiReadNotice(id));
  }, [commitRosterState, apiActive, syncGuard]);

  const resetRoster = useCallback(() => {
    commitRosterState({ ...rosterStateRef.current, roster: initialRoster() });
    pushLog('恢复原始排班表', '本周与下周排班', 'warn');
  }, [commitRosterState, pushLog]);

  const value = useMemo<Store>(
    () => ({
      user,
      login,
      logout,
      apiStatus,
      recheckBackend,
      apiActive,
      apiSignIn,
      passwords,
      changePassword,
      remembered,
      setRemembered,
      attendance,
      updateAttendance,
      submitAttendance,
      toggleNumberIssue,
      cancelNumberIssue,
      togglePhoneViolation,
      uploadReview,
      removeReviewFile,
      updateLeave,
      reviewHistory,
      expectedChanges,
      changeExpected,
      acknowledgeExpectedChange,
      verifyAnchorDate,
      setVerifyAnchorDate,
      checkShifts,
      phoneShifts,
      nextCheckShifts,
      nextPhoneShifts,
      claimed,
      claimClasses,
      swaps,
      requestSwap,
      respondSwap,
      notices,
      markNoticeRead,
      resetRoster,
      logs,
      pushLog,
      toasts,
      toast,
      dismissToast,
    }),
    [
      user,
      login,
      logout,
      apiStatus,
      recheckBackend,
      apiActive,
      apiSignIn,
      passwords,
      changePassword,
      remembered,
      setRemembered,
      attendance,
      updateAttendance,
      submitAttendance,
      toggleNumberIssue,
      cancelNumberIssue,
      togglePhoneViolation,
      uploadReview,
      removeReviewFile,
      updateLeave,
      reviewHistory,
      expectedChanges,
      changeExpected,
      acknowledgeExpectedChange,
      verifyAnchorDate,
      setVerifyAnchorDate,
      checkShifts,
      phoneShifts,
      nextCheckShifts,
      nextPhoneShifts,
      claimed,
      claimClasses,
      swaps,
      requestSwap,
      respondSwap,
      notices,
      markNoticeRead,
      resetRoster,
      logs,
      pushLog,
      toasts,
      toast,
      dismissToast,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore 必须在 StoreProvider 内使用');
  return ctx;
}

/** 供登录页使用：按当前密码表校验账号 */
export function verifyAccount(
  passwords: Record<string, string>,
  username: string,
  password: string,
): Account | undefined {
  const key = Object.keys(passwords).find((u) => u.toLowerCase() === username.trim().toLowerCase());
  if (!key || passwords[key] !== password) return undefined;
  return ACCOUNTS.find((a) => a.username === key);
}
