import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';

export function SelectField({ value, onChange, children, label, className = '', disabled = false }: { value: string; onChange: (value: string) => void; children: ReactNode; label: string; className?: string; disabled?: boolean }) {
  return <span className={`select-wrap ${className}`}><select aria-label={label} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{children}</select><ChevronDown size={12} aria-hidden="true" /></span>;
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button className="toggle-control" role="switch" aria-checked={checked} onClick={onChange}><span className={`toggle-track ${checked ? 'is-on' : ''}`}><span /></span><span>{label}</span></button>;
}
export function Modal({ title, subtitle, icon, children, onClose, drawer = false, wide = false, footer }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode; onClose: () => void; drawer?: boolean; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const rootWasInert = root?.hasAttribute('inert') || false;
    const previousAriaHidden = root?.getAttribute('aria-hidden') ?? null;
    root?.setAttribute('inert', '');
    ref.current?.focus();
    root?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || []).filter(el => el.offsetParent !== null);
    const timer = window.setTimeout(() => { (ref.current?.querySelector<HTMLElement>('[data-autofocus]') || focusable()[0] || ref.current)?.focus(); }, 30);
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const elements = focusable(); const first = elements[0]; const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { clearTimeout(timer); document.removeEventListener('keydown', handler); document.body.style.overflow = oldOverflow; if (!rootWasInert) root?.removeAttribute('inert'); if (previousAriaHidden === null) root?.removeAttribute('aria-hidden'); else root?.setAttribute('aria-hidden', previousAriaHidden); previous?.focus(); };
  }, []);
  return createPortal(<div className={`modal-backdrop ${drawer ? 'drawer-backdrop' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${drawer ? 'drawer' : ''} ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={ref} tabIndex={-1}>
      <div className="modal-header"><div className="flex items-center gap-3">{icon && <span className="modal-icon">{icon}</span>}<div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div><button className="icon-button" onClick={onClose} aria-label="Close dialog" title="Close · Esc"><X size={19} /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-footer">{footer}</div>}
    </div>
  </div>, document.body);
}
