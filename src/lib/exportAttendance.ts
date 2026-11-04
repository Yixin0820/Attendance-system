import type { Row, Workbook } from 'exceljs';
// 显式 .ts 后缀：让 node --experimental-strip-types 也能直接跑这层的单元测试
import { APP_VERSION, beijingTodayStr } from '../data.ts';
import type { AttendanceRecord } from '../types';

/** 导出样式：styled=美化表格（深蓝表头+斑马纹），plain=纯黑白表格（无底色、黑字黑框） */
export type ExportStyle = 'styled' | 'plain';

export interface AttendanceExportOptions {
  /** 默认取记录日期；空记录时使用北京时间当天日期。 */
  date?: string;
  title?: string;
  school?: string;
  filename?: string;
  /** 导出样式，默认 styled。 */
  style?: ExportStyle;
}

const COLUMNS = [
  { title: '班级', width: 18 },
  { title: '应到', width: 5 },
  { title: '实到', width: 5 },
  { title: '请假', width: 5 },
  { title: '请假分类明细', width: 26 },
  { title: '假条核查情况', width: 12 },
  { title: '玩手机人数', width: 8 },
  { title: '玩手机人员名单', width: 18 },
];
const INK = 'FF1E3A5F';
const BORDER = 'FFD9E2EC';
const LINES_PER_ROW = 12;

/** 两套配色：美化版沿用系统深蓝；黑白版一律纯黑、无填充，适合黑白打印与复印存档。 */
interface Theme {
  ink: string;
  border: string;
  body: string;
  muted: string;
  headerFill: string | null;
  headerFont: string;
  zebra: string | null;
  titleSize: number;
}

const THEMES: Record<ExportStyle, Theme> = {
  styled: {
    ink: INK,
    border: BORDER,
    body: 'FF243B53',
    muted: 'FF627D98',
    headerFill: INK,
    headerFont: 'FFFFFFFF',
    zebra: 'FFF2F6FA',
    titleSize: 19,
  },
  plain: {
    ink: 'FF000000',
    border: 'FF000000',
    body: 'FF000000',
    muted: 'FF000000',
    headerFill: null,
    headerFont: 'FF000000',
    zebra: null,
    titleSize: 16,
  },
};

function wrapLines(text: string, width: number): string[] {
  return text.split(/\r\n|\r|\n/).flatMap((paragraph) => {
    const lines: string[] = [];
    let line = '';
    let used = 0;
    for (const character of paragraph) {
      const size = character.codePointAt(0)! > 255 ? 2 : 1;
      if (used + size > width && line) {
        lines.push(line);
        line = '';
        used = 0;
      }
      line += character;
      used += size;
    }
    lines.push(line);
    return lines;
  });
}

function reportDate(records: readonly AttendanceRecord[], date?: string): string {
  if (date) return date;
  const dates = [...new Set(records.map((record) => record.date))].sort();
  return dates.length ? dates.join('、') : beijingTodayStr();
}

function styleRow(row: Row, shaded: boolean, theme: Theme) {
  row.eachCell({ includeEmpty: true }, (cell, column) => {
    cell.font = { name: '微软雅黑', size: 10, color: { argb: theme.body } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: [2, 3, 4, 6, 7].includes(column) ? 'center' : 'left',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: theme.border } },
      bottom: { style: 'thin', color: { argb: theme.border } },
      left: { style: 'thin', color: { argb: theme.border } },
      right: { style: 'thin', color: { argb: theme.border } },
    };
    // 黑白版不写填充，保留单元格默认（无底色），避免打印时出现灰块。
    const fill = shaded ? theme.zebra : null;
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  });
}

/** 仅生成工作簿，不触发下载；不依赖 store/data，可用于自动化测试。 */
export async function createAttendanceWorkbook(
  records: readonly AttendanceRecord[],
  options: AttendanceExportOptions = {},
): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const title = options.title ?? '晚自习考勤表';
  const date = reportDate(records, options.date);
  const theme = THEMES[options.style ?? 'styled'];
  const plain = (options.style ?? 'styled') === 'plain';
  workbook.creator = '晚自习考勤管理系统';
  workbook.subject = `${date} ${title}`;
  workbook.title = title;

  const sheet = workbook.addWorksheet('考勤汇总', {
    properties: { defaultRowHeight: 25 },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      showGridLines: false,
      margins: { left: 0.3, right: 0.3, top: 0.55, bottom: 0.5, header: 0.2, footer: 0.2 },
      printTitlesRow: '1:4',
    },
  });
  sheet.columns = COLUMNS.map(({ width }) => ({ width }));
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = title;
  sheet.getCell('A1').font = { name: '微软雅黑', size: theme.titleSize, bold: true, color: { argb: theme.ink } };
  sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(1).height = Math.max(38, wrapLines(title, 50).length * 26);

  sheet.mergeCells('A2:H2');
  const subtitle = [options.school, `日期：${date}`, `共 ${records.length} 个班级`].filter(Boolean).join('  ·  ');
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { name: '微软雅黑', size: 10, color: { argb: theme.muted } };
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(2).height = Math.max(24, wrapLines(subtitle, 100).length * 15);
  sheet.getRow(3).height = 9;

  const header = sheet.getRow(4);
  header.values = COLUMNS.map(({ title: label }) => label);
  styleRow(header, false, theme);
  header.height = 34;
  header.eachCell((cell) => {
    cell.font = { name: '微软雅黑', size: 10, bold: true, color: { argb: theme.headerFont } };
    if (theme.headerFill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: theme.headerFill } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });

  records.forEach((record, index) => {
    const groups = new Map<string, string[]>();
    record.leaves.forEach((leave) => {
      const names = groups.get(leave.reason) ?? [];
      names.push(leave.studentName);
      groups.set(leave.reason, names);
    });
    const details = [...groups].map(([reason, names]) => `${reason}(${names.join('/')})`).join('\n') || '—';
    const pending = record.leaves.filter((leave) => !leave.checked).length;
    const verify = record.leaves.length === 0 ? '无请假' : pending ? `待核查${pending}人` : '已核查';
    const phones = record.phoneViolations ?? [];
    const values = [
      record.className, record.expected, record.actual, record.leaveCount,
      details, verify, phones.length, phones.map((phone) => phone.studentName).join('、') || '无',
    ];
    const lines = values.map((value, column) => wrapLines(String(value), COLUMNS[column].width - 2));
    const parts = Math.ceil(Math.max(...lines.map((item) => item.length)) / LINES_PER_ROW);

    // 超长名单拆成续行，避免 Excel 的单行高度上限导致打印截断。
    for (let part = 0; part < parts; part++) {
      const start = part * LINES_PER_ROW;
      const row = sheet.addRow(values.map((value, column) => {
        if (typeof value === 'number') return part === 0 ? value : null;
        const text = lines[column].slice(start, start + LINES_PER_ROW).join('\n');
        return text || (column === 0 ? '（续上行）' : '');
      }));
      styleRow(row, index % 2 === 1, theme);
      const count = Math.max(...lines.map((item) => Math.min(LINES_PER_ROW, Math.max(0, item.length - start))));
      row.height = Math.max(30, count * 15 + 12);
      if (pending && part === 0) {
        row.getCell(6).font = { name: '微软雅黑', size: 10, bold: true, color: { argb: plain ? 'FF000000' : 'FF9A6700' } };
      }
    }
  });

  if (!records.length) {
    sheet.mergeCells('A5:H5');
    sheet.getCell('A5').value = '暂无考勤记录';
    sheet.getCell('A5').font = { name: '微软雅黑', size: 11, color: { argb: theme.muted } };
    sheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(5).height = 40;
  }

  const totals = records.reduce((sum, record) => ({
    expected: sum.expected + record.expected,
    actual: sum.actual + record.actual,
    leave: sum.leave + record.leaveCount,
    phones: sum.phones + (record.phoneViolations?.length ?? 0),
  }), { expected: 0, actual: 0, leave: 0, phones: 0 });
  const total = sheet.addRow(['合计', totals.expected, totals.actual, totals.leave, '', '', totals.phones, '']);
  styleRow(total, !plain, theme);
  total.height = 30;
  total.eachCell((cell) => { cell.font = { name: '微软雅黑', size: 10, bold: true, color: { argb: theme.ink } }; });
  sheet.mergeCells(`E${total.number}:F${total.number}`);
  total.getCell(5).value = `出勤率：${totals.expected ? `${(totals.actual / totals.expected * 100).toFixed(1)}%` : '—'}`;

  const note = sheet.addRow(['说明：统计以传入记录为准；“续上行”为同一班级名单续行，不重复计数。']);
  sheet.mergeCells(`A${note.number}:H${note.number}`);
  note.height = 28;
  note.getCell(1).font = { name: '微软雅黑', size: 9, color: { argb: theme.muted } };
  note.getCell(1).alignment = { vertical: 'middle', wrapText: true };
  sheet.pageSetup.printArea = `A1:H${note.number}`;
  // 页眉中的 & 是 Excel 控制字符，动态标题需转义。
  sheet.headerFooter.oddHeader = `&C&10${title.replace(/&/g, '&&').slice(0, 100)}`;
  sheet.headerFooter.oddFooter = `&L晚自习考勤管理系统 · ${APP_VERSION}&R第 &P 页 / 共 &N 页`;
  return workbook;
}

/** 生成真正 OOXML .xlsx 并在浏览器中下载；调用方 await 后再提示成功。 */
export async function exportAttendanceXlsx(
  records: readonly AttendanceRecord[],
  options: AttendanceExportOptions = {},
): Promise<void> {
  const workbook = await createAttendanceWorkbook(records, options);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const base =
    options.filename ??
    `晚自习考勤表_${reportDate(records, options.date)}${options.style === 'plain' ? '_黑白' : ''}`;
  const safeBase = Array.from(base.replace(/\.xlsx$/i, ''), (character) =>
    character.codePointAt(0)! < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character,
  ).join('');
  const filename = `${safeBase}.xlsx`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // 给浏览器留出消费下载 URL 的机会，避免立即回收导致下载失败。
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
