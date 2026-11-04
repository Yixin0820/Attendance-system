export type Role = 'committee' | 'inspector' | 'admin' | 'ops';

/** 登录账号 */
export interface Account {
  /** 登录账号 */
  username: string;
  /** 登录密码 */
  password: string;
  role: Role;
  /** 姓名（干事 / 管理员 / 运维）或班级名（学委） */
  name: string;
  /** 学委绑定的班级 id */
  classId?: string;
  /** 干事绑定的 staff id */
  staffId?: string;
  /** 展示用说明，如“软件工程2026级1班 学委” */
  title: string;
  enabled: boolean;
  /** 运维下发临时口令后为 true，登录后必须先修改密码才能使用系统 */
  mustChangePassword?: boolean;
}

/** 班级 */
export interface ClassInfo {
  id: string;
  name: string;
  /** 专业，如 软件工程 / 网络工程 / 通信工程 / 自动化 / 电气工程 / 人工智能 */
  major: string;
  classroom: string;
  /** 所属学院（依据《信息工程学院晚自习教室安排》） */
  college: string;
  /** 晚自习周次，如 第2-18周 */
  weeks: string;
  /** 学委姓名（可在运维端修改，默认占位） */
  committeeName: string;
  /** 班级人数（应到基准） */
  size: number;
}

/** 教室（一个教室两个班） */
export interface Classroom {
  id: string;
  name: string;
  classIds: string[];
  /** 所属学院 */
  college: string;
  /** 晚自习周次，如 第2-18周 */
  weeks: string;
  /** 备注，如“学习部备用教室” */
  note?: string;
}

export interface CertificateFile {
  id: string;
  name: string;
  /** 图片的预览地址（data URL / blob URL / 后端静态地址），可点击放大 */
  url?: string;
  /**
   * 用户选择的原始文件对象。
   * 纯前端演示时不会用到；连上后端后由 store 负责上传换回服务端 id。
   */
  file?: File;
}

/** 一条请假记录 */
export interface LeaveRecord {
  id: string;
  studentName: string;
  studentId: string;
  reason: string;
  reasonDetail?: string;
  /** 班委额外说明 */
  extraNote?: string;
  /** 是否已在类别内共享同一份假条 */
  sharedCertificate?: boolean;
  /** 选择“后续补传假条” */
  certificateLate?: boolean;
  certificateFiles: CertificateFile[];
  /** 干事核查：是否已勾选 */
  checked?: boolean;
  /** 干事核查：是否标记问题 */
  hasIssue?: boolean;
  /** 问题具体描述（管理端可见） */
  issueDescription?: string;
  /** 记录该问题是哪名干事标记的 */
  issueBy?: string;
}

/** 查手机被标记的一名同学及其检讨 */
export interface PhoneViolation {
  studentName: string;
  /** 上传的检讨图片 / 文件 */
  reviewFiles?: CertificateFile[];
  /** 检讨上传时间 HH:mm */
  reviewAt?: string;
  /** 上传检讨的干事 */
  reviewBy?: string;
}

/** 检讨存档（写入历史记录，可查询） */
export interface ReviewRecord {
  id: string;
  date: string;
  classId: string;
  className: string;
  classroom: string;
  studentName: string;
  files: CertificateFile[];
  at: string;
  by: string;
}

/** 某班某天的考勤上报 */
export interface AttendanceRecord {
  /** 后端记录 id（纯前端演示时没有） */
  id?: string;
  classId: string;
  className: string;
  classroom: string;
  date: string;
  expected: number;
  actual: number;
  leaveCount: number;
  /** 超过 20:59 上传 → 补传 */
  lateUploaded?: boolean;
  uploadedAt: string;
  leaves: LeaveRecord[];
  /** 查班阶段的人数问题标记（当日有效，次日清零） */
  numberIssue?: boolean;
  numberIssueNote?: string;
  /** 主动取消则不进入当日总结 */
  numberIssueCancelled?: boolean;
  numberIssueBy?: string;
  /** 查手机阶段被勾选“玩手机”的同学（含检讨） */
  phoneViolations?: PhoneViolation[];
}

export type ShiftType = '查班' | '考勤' | '查手机';

/** 排班表的一格：某天某类型的值班人员名单 */
export interface Shift {
  id: string;
  weekday: string;
  type: ShiftType;
  staffIds: string[];
}

/** 调班 / 换班申请 */
export interface SwapRequest {
  id: string;
  staffId: string;
  staffName: string;
  /** 来源周；兼容旧申请，未填写时按本周处理 */
  week?: '本周' | '下周';
  /** 目标周，可与来源周不同；未填写时沿用 week（旧申请默认本周） */
  targetWeek?: '本周' | '下周';
  fromWeekday: string;
  fromType: ShiftType;
  toWeekday: string;
  toType: ShiftType;
  reason: string;
  /** pending：等待被选中的替班同学回应 */
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  /** 申请调班的目标同学（由发起人在申请时指定） */
  targetStaffId: string;
  targetStaffName: string;
  /** 替班同学的回复意见 */
  reviewNote?: string;
  /** 回复时间 */
  reviewedAt?: string;
}

/** 调班结果通知（无论同意与否都会发给发起人） */
export interface SwapNotice {
  id: string;
  swapId: string;
  /** 接收通知的人（发起人） */
  toStaffName: string;
  title: string;
  detail: string;
  result: 'approved' | 'rejected';
  createdAt: string;
  read: boolean;
}

/** 学委调整应到人数的留痕记录（管理端仅确认已阅，不审批、不回退） */
export interface ExpectedChange {
  id: string;
  classId: string;
  className: string;
  /** 生效日期：自填写起持续生效，直到下一次修改 */
  date: string;
  /** 修改前应到人数 */
  from: number;
  /** 修改后应到人数 */
  to: number;
  /** 必填的修改原因 */
  reason: string;
  /** 修改人（学委） */
  by: string;
  createdAt: string;
  /** 管理端是否已确认已阅 */
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

/** 学习部干事 */
export interface Staff {
  id: string;
  name: string;
  /** 组长 / 干事 */
  role: '组长' | '干事';
  phone: string;
}

/** 假条核查分组（查考勤排班表：第 N 次） */
export interface VerifyGroup {
  id: string;
  seq: number;
  leaderId: string;
  memberIds: string[];
}
