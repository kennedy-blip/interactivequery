import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Clock3, Code2, Download, History, RotateCcw, Search, SearchX, Table2, Trash2, X } from 'lucide-react';
import { type Dialect, type ExecutionResult, type QueryConfig } from '../lib/database';

export interface HistoryEntry { id: string; name: string; sql: string; config: QueryConfig; dialect: Dialect; latency: number; rowCount: number; ranAt: number; indexes: string[] }
export function Results({ result, onExport }: { result: ExecutionResult; onExport: () => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; direction: 'ASC' | 'DESC' } | null>(null);
  const pageSize = 8;
  useEffect(() => { setPage(0); setSearch(''); setSort(null); }, [result.ranAt]);
  const filtered = useMemo(() => {
    const rows = result.rows.filter(row => !search || Object.values(row).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())));
    if (sort) rows.sort((a, b) => {
      const av = a[sort.key]; const bv = b[sort.key];
      const value = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true });
      return sort.direction === 'ASC' ? value : -value;
    });
    return rows;
  }, [result.rows, search, sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  return <section className="panel results-panel">
    <div className="analysis-card-heading"><div className="flex items-center gap-2.5"><Table2 size={17} className="text-emerald-400" /><h3>Query results</h3><span className="tiny-badge badge-emerald"><Check size={10} />{result.rows.length.toLocaleString()} rows</span></div><button className="text-button" onClick={onExport} disabled={!result.rows.length}><Download size={14} />Export CSV</button></div>
    <div className="results-toolbar"><label className="search-field"><Search size={14} /><input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search returned rows…" aria-label="Search query results" />{search && <button onClick={() => { setSearch(''); setPage(0); }} aria-label="Clear result search"><X size={13} /></button>}</label><span className="mono text-muted">{result.latency} ms <span className="text-dim">/</span> {result.totalMatched.toLocaleString()} matched</span></div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th className="row-index">#</th>{result.columns.map(column => <th key={column.key} className={column.type === 'number' ? 'numeric' : ''}><button onClick={() => { setSort({ key: column.key, direction: sort?.key === column.key && sort.direction === 'ASC' ? 'DESC' : 'ASC' }); setPage(0); }}>{column.key}<span className="column-type">{column.type === 'number' ? '#' : 'Aa'}</span>{sort?.key === column.key ? sort.direction === 'ASC' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={11} />}</button></th>)}</tr></thead><tbody>{visible.map((row, index) => <tr key={safePage * pageSize + index}><td className="row-index">{safePage * pageSize + index + 1}</td>{result.columns.map(column => <td key={column.key} className={`${column.type === 'number' ? 'numeric' : ''} ${column.key === 'id' ? 'id-cell' : ''}`} title={String(row[column.key] ?? 'NULL')}>{row[column.key] == null ? <span className="null-value">NULL</span> : column.type === 'number' ? typeof row[column.key] === 'number' ? (row[column.key] as number).toLocaleString(undefined, { maximumFractionDigits: 2 }) : row[column.key] : String(row[column.key])}</td>)}</tr>)}</tbody></table></div>
    {!visible.length && <div className="empty-state"><SearchX size={30} /><h3>{search ? 'No matching rows' : 'No rows returned'}</h3><p>{search ? 'Try another name, number, or value.' : 'Broaden your WHERE filters and run the query again.'}</p>{search && <button className="button button-secondary" onClick={() => setSearch('')}>Clear search</button>}</div>}
    <div className="pagination"><span>{filtered.length ? `${safePage * pageSize + 1}–${Math.min((safePage + 1) * pageSize, filtered.length)}` : '0'} of {filtered.length.toLocaleString()} rows</span><div><button className="icon-button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous result page"><ChevronLeft size={16} /></button><span>Page {safePage + 1} of {pages}</span><button className="icon-button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)} aria-label="Next result page"><ChevronRight size={16} /></button></div></div>
  </section>;
}
export function QueryHistory({ entries, onLoad, onDelete, onClear }: { entries: HistoryEntry[]; onLoad: (entry: HistoryEntry) => void; onDelete: (id: string) => void; onClear: () => void }) {
  const [search, setSearch] = useState('');
  const filtered = entries.filter(entry => `${entry.name} ${entry.sql} ${entry.dialect}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="panel history-panel"><div className="analysis-card-heading"><div className="flex items-center gap-2.5"><History size={17} className="text-indigo-400" /><h3>Recent queries</h3><span className="count-badge">{entries.length}</span></div><button className="text-button" disabled={!entries.length} onClick={onClear}><Trash2 size={13} />Clear history</button></div><div className="results-toolbar"><label className="search-field"><Search size={14} /><input placeholder="Find a previous query…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search query history" />{search && <button onClick={() => setSearch('')} aria-label="Clear history search"><X size={13} /></button>}</label><span className="text-muted flex items-center gap-1.5"><Clock3 size={12} />On this device</span></div>
    {!filtered.length ? <div className="empty-state history-empty"><History size={34} /><h3>{search ? 'No queries found' : 'A fresh start'}</h3><p>{search ? 'Try a different table name or SQL keyword.' : 'Run your first query. Its SQL, dialect, and performance will be right here.'}</p>{search && <button className="button button-secondary" onClick={() => setSearch('')}>Clear search</button>}</div> : <div className="history-list">{filtered.map(entry => <div className="history-item" key={entry.id}><span className="history-query-icon"><Code2 size={18} /></span><div className="history-item-main"><div><strong>{entry.name}</strong><span className="tiny-badge badge-neutral">{entry.dialect}</span></div><p>{entry.sql.replace(/\s+/g, ' ')}</p><span className="history-meta">{new Date(entry.ranAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}<i />{entry.latency} ms<i />{entry.rowCount.toLocaleString()} rows</span></div><button className="button button-secondary button-small" onClick={() => onLoad(entry)}><RotateCcw size={12} />Load</button><button className="icon-button delete-button" onClick={() => onDelete(entry.id)} aria-label={`Delete ${entry.name} from history`} title="Remove from history"><Trash2 size={14} /></button></div>)}</div>}
    <div className="history-footer">Your last 20 executions are saved locally. Loading a query restores the builder and SQL.</div>
  </section>;
}
