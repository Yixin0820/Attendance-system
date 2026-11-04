import { useState, type ReactNode } from 'react';
import { X, AlertCircle, CheckCircle2, AlertTriangle, Info, ZoomIn } from 'lucide-react';
import { useStore } from '../store';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'brand';
}) {
  const tones: Record<string, string> = {
    default: 'text-ink-900',
    success: 'text-emerald-600',
    warning: 'text-amber-600',
    danger: 'text-rose-600',
    brand: 'text-brand-600',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-ink-500">{label}</span>
      </div>
      <div className={`mt-2 stat-num ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </Card>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 7l9-4 9 4-9 4-9-4z" />
          <path d="M3 12l9 4 9-4" />
          <path d="M3 17l9 4 9-4" />
        </svg>
      </div>
      <p className="mt-3 text-sm text-ink-400">{text}</p>
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'info';
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-ink-100 text-ink-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
    brand: 'bg-brand-50 text-brand-600',
    info: 'bg-blue-50 text-blue-600',
  };
  return <span className={`chip ${tones[tone]}`}>{children}</span>;
}

/** 通用弹窗 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className={`animate-scaleIn max-h-[92vh] w-full ${width} overflow-y-auto rounded-t-3xl bg-white shadow-card sm:rounded-2xl`}>
        <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-ink-100 bg-white px-6 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink-900">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-ink-100 bg-white px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** 图片放大查看器 */
export function ImageLightbox({
  src,
  name,
  onClose,
}: {
  src: string;
  name: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-ink-950/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="mb-3 flex items-center gap-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span className="max-w-[70vw] truncate">{name}</span>
        <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1 text-xs hover:bg-white/20">
          关闭
        </button>
      </div>
      <img
        src={src}
        alt={name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[78vh] max-w-full rounded-xl bg-white shadow-card"
      />
      <p className="mt-3 text-xs text-white/60">点击空白处关闭</p>
    </div>
  );
}

/** 可点击放大的假条缩略图 */
export function CertificateThumb({ file }: { file: { id: string; name: string; url?: string } }) {
  const [open, setOpen] = useState(false);
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="点击放大查看"
        className="group relative inline-flex items-center gap-1.5 rounded-lg border border-ink-100 bg-white px-2 py-1 text-[11px] text-ink-500 shadow-soft transition-all hover:border-brand-200 hover:text-brand-600"
      >
        {isImage && file.url ? (
          <img src={file.url} alt={file.name} className="h-6 w-6 rounded object-cover" />
        ) : (
          <ZoomIn size={11} />
        )}
        <span className="max-w-[140px] truncate">{file.name}</span>
      </button>
      {open && file.url && (
        <ImageLightbox src={file.url} name={file.name} onClose={() => setOpen(false)} />
      )}
      {open && !file.url && (
        <Modal title={file.name} subtitle="该文件暂无预览" onClose={() => setOpen(false)} width="max-w-md">
          <p className="text-sm text-ink-500">演示环境中该文件仅记录文件名，未保存实际内容。</p>
        </Modal>
      )}
    </>
  );
}

/** 全局提示条 */
export function ToastHost() {
  const { toasts } = useStore();
  const icons = {
    success: CheckCircle2,
    warning: AlertTriangle,
    danger: AlertCircle,
    info: Info,
  };
  const tones = {
    success: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-100 bg-amber-50 text-amber-700',
    danger: 'border-rose-100 bg-rose-50 text-rose-700',
    info: 'border-ink-200 bg-white text-ink-700',
  };

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div
            key={t.id}
            className={`animate-scaleIn pointer-events-auto flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm shadow-card ${tones[t.tone]}`}
          >
            <Icon size={16} />
            <span>{t.text}</span>
          </div>
        );
      })}
    </div>
  );
}
