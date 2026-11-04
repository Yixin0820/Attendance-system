import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttendanceWorkbook } from './exportAttendance.ts';

const record = {
  id: 'a1',
  classId: 'k01',
  className: '软件工程2026级1班',
  classroom: '明理楼303',
  date: '2026-11-01',
  expected: 32,
  actual: 30,
  leaveCount: 2,
  submitted: true,
  submittedBy: '测试学委',
  leaves: [
    { id: 'l1', studentName: '张三', studentId: '20260101', reason: '病假', checked: true, hasIssue: false },
    { id: 'l2', studentName: '李四', studentId: '20260102', reason: '事假', checked: false, hasIssue: false },
  ],
  phoneViolations: [{ studentName: '王五' }],
  note: '',
};

function cells(workbook) {
  const sheet = workbook.getWorksheet('考勤汇总');
  const out = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => out.push(cell));
  });
  return out;
}

test('美化版：表头深蓝底白字、有斑马纹底色', async () => {
  const wb = await createAttendanceWorkbook([record], { style: 'styled' });
  const all = cells(wb);
  const header = wb.getWorksheet('考勤汇总').getRow(4).getCell(1);
  assert.equal(header.value, '班级');
  assert.equal(header.font.color.argb, 'FFFFFFFF');
  assert.equal(header.fill.fgColor.argb, 'FF1E3A5F');
  const shaded = all.filter((c) => c.fill && c.fill.fgColor && c.fill.fgColor.argb === 'FFF2F6FA');
  assert.ok(shaded.length > 0, '美化版应存在浅色斑马纹单元格');
});

test('纯黑白版：无任何彩色填充，文字统一为纯黑', async () => {
  const wb = await createAttendanceWorkbook([record], { style: 'plain' });
  const all = cells(wb);
  const colors = new Set(all.map((c) => c.font?.color?.argb).filter(Boolean));
  assert.deepEqual([...colors], ['FF000000'], `黑白版不应出现彩色文字，实际：${[...colors]}`);
  const filled = all.filter((c) => c.fill && c.fill.fgColor);
  assert.equal(filled.length, 0, `黑白版不应有单元格填充，实际 ${filled.length} 个`);
  const borders = new Set(
    all.map((c) => c.border?.top?.color?.argb).filter(Boolean),
  );
  assert.deepEqual([...borders], ['FF000000'], '黑白版边框应为纯黑');
});

test('两种样式的数据内容完全一致', async () => {
  const styled = await createAttendanceWorkbook([record], { style: 'styled' });
  const plain = await createAttendanceWorkbook([record], { style: 'plain' });
  const values = (wb) => wb.getWorksheet('考勤汇总').getRows(1, wb.getWorksheet('考勤汇总').rowCount)
    ?.map((r) => r.values).map((v) => (Array.isArray(v) ? v.slice(1).join('|') : ''));
  assert.deepEqual(values(plain), values(styled));
});

test('A4 纵版与打印区设置在两种样式下都保留', async () => {
  for (const style of ['styled', 'plain']) {
    const wb = await createAttendanceWorkbook([record], { style });
    const page = wb.getWorksheet('考勤汇总').pageSetup;
    assert.equal(page.paperSize, 9, `${style} 应为 A4`);
    assert.equal(page.orientation, 'portrait', `${style} 应为纵版`);
    assert.equal(page.printTitlesRow, '1:4', `${style} 应重复标题行`);
  }
});
