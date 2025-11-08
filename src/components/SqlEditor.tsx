import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft } from 'lucide-react';

const KEYWORDS = new Set('SELECT FROM WHERE JOIN INNER LEFT RIGHT FULL OUTER ON AS GROUP BY ORDER HAVING LIMIT OFFSET ASC DESC AND OR NOT NULL IN IS LIKE ILIKE BETWEEN DISTINCT CREATE INDEX CONCURRENTLY IF EXISTS USING BTREE ALTER TABLE CLUSTER EXPLAIN ANALYZE WITH UNION ALL'.split(' '));
const FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'ROUND']);
const TABLES = new Set(['users', 'orders', 'products', 'analytics']);
export function highlightSql(sql: string): ReactNode[] {
  const pattern = /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|[(),;*=<>!.-])/g;
  const nodes: ReactNode[] = []; let cursor = 0;
  for (const match of sql.matchAll(pattern)) {
    if (match.index! > cursor) nodes.push(sql.slice(cursor, match.index));
    const token = match[0]; let className = 'sql-punctuation';
    if (token.startsWith('--') || token.startsWith('/*')) className = 'sql-comment';
    else if (/^['"]/.test(token)) className = 'sql-string';
    else if (/^\d/.test(token)) className = 'sql-number';
    else if (KEYWORDS.has(token.toUpperCase())) className = 'sql-keyword';
    else if (FUNCTIONS.has(token.toUpperCase())) className = 'sql-function';
    else if (TABLES.has(token.toLowerCase())) className = 'sql-table';
    else if (/^[A-Za-z_]/.test(token)) className = 'sql-identifier';
    nodes.push(<span className={className} key={`${match.index}-${token}`}>{token}</span>);
    cursor = match.index! + token.length;
  }
  if (cursor < sql.length) nodes.push(sql.slice(cursor));
  return nodes;
}
interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  suggestions?: string[];
  minHeight?: number;
  expanded?: boolean;
}
export function SqlEditor({ value, onChange, error, suggestions = [], minHeight = 300, expanded = false }: SqlEditorProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const numbers = useRef<HTMLDivElement>(null);
  const [completion, setCompletion] = useState<{ prefix: string; items: string[] } | null>(null);
  const highlighted = useMemo(() => highlightSql(value), [value]);
  const lineCount = value.split('\n').length;
  function update(next: string, position?: number) {
    onChange(next);
    const prefix = next.slice(0, position ?? textarea.current?.selectionStart ?? next.length).match(/[\w.]+$/)?.[0] || '';
    const items = prefix.length >= 2 ? suggestions.filter(s => s.toLowerCase().startsWith(prefix.toLowerCase()) && s.toLowerCase() !== prefix.toLowerCase()).slice(0, 5) : [];
    setCompletion(items.length ? { prefix, items } : null);
  }
  function accept(item: string) {
    const area = textarea.current; if (!area || !completion) return;
    const position = area.selectionStart;
    const next = `${value.slice(0, position - completion.prefix.length)}${item}${value.slice(position)}`;
    setCompletion(null); onChange(next);
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(position - completion.prefix.length + item.length, position - completion.prefix.length + item.length); });
  }
  return <div className={`sql-editor ${expanded ? 'sql-editor-expanded' : ''} ${error ? 'has-error' : ''}`} style={{ minHeight }}>
    <div className="sql-code-area" style={{ height: expanded ? 'calc(100vh - 245px)' : minHeight }}>
      <div className="sql-line-numbers" ref={numbers} aria-hidden="true"><div>{Array.from({ length: lineCount }, (_, i) => <span key={i}>{i + 1}</span>)}</div></div>
      <div className="sql-input-wrap">
        <pre className="sql-highlight" ref={pre} aria-hidden="true"><code>{highlighted}{'\n'}</code></pre>
        <textarea
          ref={textarea}
          value={value}
          onChange={event => update(event.target.value, event.target.selectionStart)}
          onClick={() => setCompletion(null)}
          onScroll={event => {
            if (pre.current) { pre.current.scrollTop = event.currentTarget.scrollTop; pre.current.scrollLeft = event.currentTarget.scrollLeft; }
            if (numbers.current) numbers.current.scrollTop = event.currentTarget.scrollTop;
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') setCompletion(null);
            if (event.key === 'Tab' && completion?.items.length) { event.preventDefault(); accept(completion.items[0]); }
            else if (event.key === 'Tab') {
              event.preventDefault(); const start = event.currentTarget.selectionStart; const end = event.currentTarget.selectionEnd;
              const next = `${value.slice(0, start)}  ${value.slice(end)}`;
              onChange(next); requestAnimationFrame(() => textarea.current?.setSelectionRange(start + 2, start + 2));
            }
            if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
              event.preventDefault(); const prefix = value.slice(0, event.currentTarget.selectionStart).match(/[\w.]+$/)?.[0] || '';
              setCompletion({ prefix, items: suggestions.filter(s => s.toLowerCase().startsWith(prefix.toLowerCase())).slice(0, 5) });
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          aria-label="SQL query editor"
          aria-describedby={error ? 'sql-editor-error' : 'sql-editor-help'}
          aria-invalid={Boolean(error)}
          className="sql-textarea"
        />
        {completion && <div className="sql-completion" role="listbox" aria-label="SQL suggestions">
          <div className="completion-heading">Suggestions <span><CornerDownLeft size={11} /> Tab to complete</span></div>
          {completion.items.map((item, index) => <button key={item} role="option" aria-selected={index === 0} onMouseDown={e => e.preventDefault()} onClick={() => accept(item)}><span>{item}</span><span>{index === 0 ? 'Tab' : ''}</span></button>)}
        </div>}
      </div>
    </div>
    <span className="sr-only" id="sql-editor-help">Edit your SELECT query. Press Control Enter to run, Control Space for suggestions, or Tab to indent.</span>
  </div>;
}
