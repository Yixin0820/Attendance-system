/** 导出 Excel 前让用户挑样式：美化表格 / 纯黑白表格。 */

import { FileSpreadsheet, Palette, Printer } from 'lucide-react';
import { Modal } from './ui';
import type { ExportStyle } from '../lib/exportAttendance';

function Preview({ style }: { style: ExportStyle }) {
  const plain = style === 'plain';
  const head = plain ? 'bg-white text-black border-black' : 'bg-[#1e3a5f] text-white border-[#1e3a5f]';
  const zebra = plain ? 'bg-white' : 'bg-[#f2f6fa]';
  const line = plain ? 'border-black text-black' : 'border-[#d9e2ec] text-[#243b53]';
  return (
    <div className="overflow-hidden rounded-lg border border-ink-200">
      <table className="w-full border-collapse text-[10px] leading-none">
        <thead>
          <tr>
            {['班级', '应到', '实到', '请假'].map((h) => (
              <th key={h} className={`border px-1.5 py-1 font-medium ${head}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[0, 1, 2].map((i) => (
            <tr key={i} className={i === 1 ? zebra : 'bg-white'}>
              <td className={`border px-1.5 py-1 ${line}`}>软件工程1班</td>
              <td className={`border px-1.5 py-1 text-center ${line}`}>32</td>
              <td className={`border px-1.5 py-1 text-center ${line}`}>30</td>
              <td className={`border px-1.5 py-1 text-center ${line}`}>2</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Option({
  style,
  active,
  onSelect,
  disabled,
}: {
  style: ExportStyle;
  active: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  const plain = style === 'plain';
  const Icon = plain ? Printer : Palette;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full rounded-xl border p-4 text-left transition ${
        active ? 'border-[#1e3a5f] ring-2 ring-[#1e3a5f]/20' : 'border-ink-200 hover:border-ink-400'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} className={plain ? 'text-ink-600' : 'text-[#1e3a5f]'} />
        <span className="text-sm font-semibold text-ink-800">{plain ? '纯黑白表格' : '美化表格'}</span>
        {!plain && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-500">默认</span>}
      </div>
      <Preview style={style} />
      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        {plain
          ? '无底色、黑字黑框，标题与表头仅加粗。适合黑白打印机、复印存档与扫描件归档。'
          : '深蓝表头 + 浅色斑马纹，A4 纵版并已设好打印区域与页脚页码。适合彩色打印与电子存档。'}
      </p>
    </button>
  );
}

export function ExportStyleDialog({
  onClose,
  onPick,
  busy = false,
  subtitle,
}: {
  onClose: () => void;
  onPick: (style: ExportStyle) => void;
  busy?: boolean;
  subtitle?: string;
}) {
  return (
    <Modal
      title="导出 Excel · 选择表格样式"
      subtitle={subtitle ?? '两种样式内容完全一致，仅排版配色不同'}
      onClose={busy ? () => undefined : onClose}
      width="max-w-2xl"
      footer={
        <button onClick={onClose} disabled={busy} className="btn-secondary">
          取消
        </button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Option style="styled" active={false} disabled={busy} onSelect={() => onPick('styled')} />
        <Option style="plain" active={false} disabled={busy} onSelect={() => onPick('plain')} />
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-400">
        <FileSpreadsheet size={13} className="mt-0.5 shrink-0" />
        导出为真正 .xlsx（非 CSV），A4 纵版，可用 Excel / WPS 直接打开与打印。
      </p>
    </Modal>
  );
}
