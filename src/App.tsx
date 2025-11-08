import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlignLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, CircleCheck, Clock3, Code2, Copy, Database, Download, FileCode2, FileJson, FlaskConical, HardDrive, History, Info, Keyboard, Layers2, LoaderCircle, Maximize2, Network, Play, Plus, Rows3, Search, ShieldCheck, Snowflake, Sparkles, Table2, TriangleAlert, Users, Workflow, X, Zap } from 'lucide-react';
import { VisualBuilder } from './components/VisualBuilder';
import { SqlEditor } from './components/SqlEditor';
import { PlanVisualizer } from './components/PlanVisualizer';
import { PerformanceGauge } from './components/PerformanceGauge';
import { QueryHistory, Results, type HistoryEntry } from './components/Results';
import { OptimizerDrawer, SchemaDrawer } from './components/Drawers';
import { Modal } from './components/UI';
import { csvReport, estimatedLatency, getRecommendations, indexKey, indexScript, makePlan, optimizationScore, planJson, queryReport, type Recommendation } from './lib/analysis';
import { cloneConfig, compileQuery, DEFAULT_CONFIG, DIALECTS, executeQuery, getAliases, parseQuery, SCHEMAS, TABLE_NAMES, uid, validateConfig, type Dialect, type ExecutionResult, type QueryConfig, type TableName } from './lib/database';

type ModalName = 'optimizer' | 'schema' | 'templates' | 'guide' | 'search' | 'clear-history' | null;
type Toast = { id: number; message: string; detail?: string; type: 'success' | 'error' | 'info' };
interface Workspace { config: QueryConfig; sql: string; dialect: Dialect; indexes: string[]; name: string; history: HistoryEntry[] }
function initialWorkspace(): Workspace {
  const fallback: Workspace = { config: cloneConfig(DEFAULT_CONFIG), sql: compileQuery(DEFAULT_CONFIG), dialect: 'PostgreSQL', indexes: [], name: 'customer_spend.sql', history: [] };
  try {
    const raw = localStorage.getItem('querypulse.workspace.v1');
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    if (!saved.config || validateConfig(saved.config) || !DIALECTS.includes(saved.dialect)) return fallback;
    return { config: saved.config, sql: typeof saved.sql === 'string' ? saved.sql : compileQuery(saved.config), dialect: saved.dialect, indexes: Array.isArray(saved.indexes) ? saved.indexes.filter((i: unknown) => typeof i === 'string') : [], name: typeof saved.name === 'string' ? saved.name.slice(0, 60) : fallback.name, history: Array.isArray(saved.history) ? saved.history.filter((e: HistoryEntry) => e.id && e.sql && e.config && !validateConfig(e.config)).slice(0, 20) : [] };
  } catch { return fallback; }
}
function downloadFile(content: string, name: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const TEMPLATES: { id: string; name: string; description: string; tag: string; icon: 'users' | 'products' | 'analytics' | 'blank'; config: QueryConfig }[] = [
  { id: 'customer-spend', name: 'Customer spend analysis', description: 'Find your most valuable customers by joining users and orders.', tag: 'JOIN + AGGREGATE', icon: 'users', config: DEFAULT_CONFIG },
  { id: 'product-performance', name: 'Product performance', description: 'Compare order volume and revenue across your product catalog.', tag: 'REVENUE ANALYSIS', icon: 'products', config: { table: 'products', alias: 'p', columns: [{ id: 'p-name', table: 'products', column: 'name' }, { id: 'p-count', table: 'orders', column: 'id', aggregate: 'COUNT', alias: 'order_count' }, { id: 'p-revenue', table: 'orders', column: 'total', aggregate: 'SUM', alias: 'revenue' }], joins: [{ id: 'p-orders', table: 'orders', alias: 'o', type: 'INNER', leftTable: 'products', leftColumn: 'id', rightColumn: 'product_id' }], filters: [{ id: 'p-status', table: 'orders', column: 'status', operator: '=', value: 'completed' }], filterLogic: 'AND', order: { field: 'revenue', direction: 'DESC' }, limit: 50 } },
  { id: 'event-exploration', name: 'Explore product events', description: 'Understand event volume and engagement in your analytics data.', tag: 'EVENT ANALYSIS', icon: 'analytics', config: { table: 'analytics', alias: 'a', columns: [{ id: 'a-event', table: 'analytics', column: 'event_type' }, { id: 'a-count', table: 'analytics', column: '*', aggregate: 'COUNT', alias: 'event_count' }, { id: 'a-duration', table: 'analytics', column: 'duration_ms', aggregate: 'AVG', alias: 'avg_duration_ms' }], joins: [], filters: [{ id: 'a-duration-filter', table: 'analytics', column: 'duration_ms', operator: '>', value: '0' }], filterLogic: 'AND', order: { field: 'event_count', direction: 'DESC' }, limit: 100 } },
  { id: 'blank', name: 'Start from scratch', description: 'One table, a few columns, and a clean slate. Make it your own.', tag: 'BLANK QUERY', icon: 'blank', config: { ...cloneConfig(DEFAULT_CONFIG), columns: [{ id: 'new-id', table: 'users', column: 'id' }, { id: 'new-name', table: 'users', column: 'name' }, { id: 'new-email', table: 'users', column: 'email' }], joins: [], filters: [], order: { field: 'id', direction: 'ASC' } } },
];

export function App() {
  const [initial] = useState(initialWorkspace);
  const [config, setConfig] = useState<QueryConfig>(initial.config);
  const [sql, setSql] = useState(initial.sql);
  const [dialect, setDialect] = useState<Dialect>(initial.dialect);
  const [indexes, setIndexes] = useState<string[]>(initial.indexes);
  const [name, setName] = useState(initial.name);
  const [history, setHistory] = useState<HistoryEntry[]>(initial.history);
  const [result, setResult] = useState<ExecutionResult>(() => ({ ...executeQuery(initial.config), latency: estimatedLatency(initial.config, initial.dialect, initial.indexes), ranAt: Date.now(), sql: initial.sql, config: initial.config, dialect: initial.dialect, indexes: initial.indexes, source: 'sample' }));
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<'plan' | 'results' | 'history'>('plan');
  const [modal, setModal] = useState<ModalName>(null);
  const [schemaTable, setSchemaTable] = useState<TableName>('users');
  const [expanded, setExpanded] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [commandSearch, setCommandSearch] = useState('');
  const commandList = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'session'>('saved');
  const parsed = useMemo(() => parseQuery(sql), [sql]);
  const queryError = parsed.error || validateConfig(config);
  const score = optimizationScore(config, dialect, indexes);
  const recommendations = getRecommendations(config, dialect, indexes);
  const pending = recommendations.filter(r => !r.resolved && r.table);
  const firstTip = pending[0];
  const dirty = sql.trim() !== result.sql.trim() || dialect !== result.dialect || JSON.stringify(indexes) !== JSON.stringify(result.indexes);
  const editorSuggestions = useMemo(() => ['SELECT', 'FROM', 'WHERE', 'INNER JOIN', 'LEFT JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'COUNT', 'SUM', 'AVG', 'DESC', 'ASC', ...TABLE_NAMES, ...Object.entries(getAliases(config)).flatMap(([table, alias]) => SCHEMAS[table as TableName].columns.map(column => `${alias}.${column.name}`))], [config]);
  const notify = useCallback((message: string, type: Toast['type'] = 'success', detail?: string) => setToast({ id: Date.now(), message, type, detail }), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.type === 'error' ? 6500 : 4400); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => {
    try { localStorage.setItem('querypulse.workspace.v1', JSON.stringify({ config, sql, dialect, indexes, name, history })); setSaveStatus('saved'); }
    catch { setSaveStatus('session'); }
  }, [config, sql, dialect, indexes, name, history]);
  useEffect(() => {
    if (!exportOpen) return;
    const outside = (event: MouseEvent) => { if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExportOpen(false); };
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape); };
  }, [exportOpen]);

  const runQuery = useCallback((options: { indexes?: string[]; keepTab?: boolean; notice?: string } = {}) => {
    if (runningRef.current) return;
    if (queryError) { notify('Your query needs a quick fix', 'error', queryError); return; }
    const captured = { config: cloneConfig(config), sql, dialect, indexes: [...(options.indexes || indexes)], name: name.trim() || 'untitled.sql' };
    runningRef.current = true; setRunning(true);
    timerRef.current = setTimeout(() => {
      try {
        const execution = executeQuery(captured.config);
        const latency = Math.max(5, estimatedLatency(captured.config, captured.dialect, captured.indexes) + Math.floor(Math.random() * 9) - 4);
        const ranAt = Date.now();
        setResult({ ...execution, latency, ranAt, ...captured, source: 'manual' });
        setHistory(previous => [{ id: uid(), name: captured.name, sql: captured.sql, config: captured.config, dialect: captured.dialect, indexes: captured.indexes, latency, rowCount: execution.rows.length, ranAt }, ...previous].slice(0, 20));
        if (!options.keepTab) setActiveTab('results');
        notify(options.notice || `Query completed in ${latency} ms`, 'success', `${execution.rows.length.toLocaleString()} rows returned from ${execution.totalMatched.toLocaleString()} matching rows.`);
      } catch (error) { notify('Query could not be executed', 'error', error instanceof Error ? error.message : 'Please check your query and try again.'); }
      finally { runningRef.current = false; setRunning(false); }
    }, 680);
  }, [config, sql, dialect, indexes, name, queryError, notify]);
  const changeBuilder = useCallback((next: QueryConfig) => { setConfig(next); setSql(compileQuery(next)); }, []);
  const changeSql = useCallback((next: string) => { setSql(next); const nextParsed = parseQuery(next); if (nextParsed.config) setConfig(nextParsed.config); }, []);
  const formatSql = useCallback(() => {
    const formatted = parseQuery(sql);
    if (!formatted.config) { notify('Unable to format this query', 'error', formatted.error || 'Check your SELECT syntax.'); return; }
    setConfig(formatted.config); setSql(compileQuery(formatted.config)); notify('SQL, looking sharp', 'success', 'Your clauses, joins, and column expressions are neatly formatted.');
  }, [sql, notify]);
  const copyText = useCallback(async (text: string, message = 'Copied to clipboard') => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.appendChild(field); field.select();
        const success = document.execCommand('copy'); field.remove(); if (!success) throw new Error('Clipboard unavailable');
      }
      notify(message);
    } catch { notify('Clipboard access is unavailable', 'error', 'Use the download action to save a copy instead.'); }
  }, [notify]);
  function changeDialect(next: Dialect) {
    if (next === dialect) return;
    setDialect(next);
    const current = parseQuery(sql); if (current.config) { setConfig(current.config); setSql(compileQuery(current.config)); }
    notify(`${next} dialect selected`, 'info', 'Execution plans and optimization scripts now use your selected dialect.');
  }
  function exportReport(format: 'report' | 'json' | 'sql' | 'csv') {
    const base = name.replace(/\.sql$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'query';
    const reportScore = optimizationScore(result.config, result.dialect, result.indexes);
    if (format === 'report') downloadFile(queryReport(result, reportScore), `${base}-report.md`, 'text/markdown');
    if (format === 'csv') downloadFile(csvReport(result), `${base}-results.csv`, 'text/csv;charset=utf-8');
    if (format === 'sql') downloadFile(sql, `${base}.sql`, 'application/sql');
    if (format === 'json') downloadFile(JSON.stringify({ application: 'QueryPulse', simulated: true, dialect, query: sql, lastExecution: { ...result, config: undefined }, optimizationScore: reportScore, plan: JSON.parse(planJson(makePlan(result.config, result.dialect, result.indexes, result.latency, result.totalMatched), result.dialect, true)), recommendations: getRecommendations(result.config, result.dialect, result.indexes).map(r => ({ ...r, script: r.table ? indexScript(r, result.dialect) : undefined })) }, null, 2), `${base}-report.json`, 'application/json');
    setExportOpen(false); notify(format === 'sql' ? 'SQL script exported' : format === 'csv' ? 'Query results exported' : 'Query report exported', 'success', format === 'sql' ? 'Your current editor contents are saved as a .sql file.' : 'The download includes your last completed execution.');
  }
  function applyRecommendation(recommendation: Recommendation) {
    if (!recommendation.table || !recommendation.column || recommendation.resolved) return;
    const next = [...indexes, indexKey(dialect, recommendation.table, recommendation.column)];
    setIndexes(next); runQuery({ indexes: next, keepTab: true, notice: dialect === 'Snowflake' ? 'Clustering applied in the sandbox' : 'Index applied. A faster query is ready.' });
  }
  function openSchema(table: TableName) { setSchemaTable(table); setModal('schema'); }
  function openHistory() { setActiveTab('history'); setModal(null); requestAnimationFrame(() => document.getElementById('analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  function loadTemplate(template: (typeof TEMPLATES)[number]) {
    const next = cloneConfig(template.config); changeBuilder(next);
    setName(template.id === 'customer-spend' ? 'customer_spend.sql' : `${template.id.replace(/-/g, '_')}.sql`);
    setModal(null); setActiveTab('plan'); notify(`${template.name} is ready`, 'success', 'Make it your own, then run the query.');
    document.getElementById('workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function queryTable(table: TableName) {
    const next: QueryConfig = { table, alias: table[0], columns: SCHEMAS[table].columns.slice(0, 3).map(c => ({ id: uid(), table, column: c.name })), joins: [], filters: [], filterLogic: 'AND', order: { field: 'id', direction: 'ASC' }, limit: 100 };
    changeBuilder(next); setName(`${table}_exploration.sql`); setModal(null); notify(`Exploring ${table}`, 'success', `${SCHEMAS[table].rows.toLocaleString()} sample rows are ready to query.`);
  }
  function loadHistory(entry: HistoryEntry) { setConfig(cloneConfig(entry.config)); setSql(entry.sql); setDialect(entry.dialect); setIndexes(entry.indexes || []); setName(entry.name); setActiveTab('plan'); notify('Previous query restored', 'success', 'Your builder and SQL are ready. Run the query to execute it again.'); document.getElementById('workbench')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); runQuery(); }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); formatSql(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (document.querySelector('[role="dialog"]')) return; setExpanded(false); setCommandSearch(''); setModal('search'); }
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, [runQuery, formatSql]);
  const commandItems = [
    { id: 'run', label: 'Run query', detail: 'Execute the current SQL', icon: Play, action: () => runQuery(), search: 'run execute query' },
    { id: 'format', label: 'Format SQL', detail: 'Clean up your current query', icon: AlignLeft, action: formatSql, search: 'format sql beautify' },
    { id: 'export', label: 'Export query report', detail: 'Download a Markdown report', icon: Download, action: () => exportReport('report'), search: 'export report download' },
    { id: 'optimize', label: 'Open query optimizer', detail: `${pending.length} index recommendations`, icon: Sparkles, action: () => setModal('optimizer'), search: 'index optimization recommendations' },
    ...TABLE_NAMES.map(table => ({ id: `table-${table}`, label: table, detail: `${SCHEMAS[table].rows.toLocaleString()} rows · ${SCHEMAS[table].columns.length} columns`, icon: Table2, action: () => openSchema(table), search: `${table} schema table columns` })),
    ...TEMPLATES.map(template => ({ id: `template-${template.id}`, label: template.name, detail: template.tag.toLowerCase(), icon: Layers2, action: () => loadTemplate(template), search: `${template.name} template new query` })),
    ...history.slice(0, 5).map(entry => ({ id: entry.id, label: entry.name, detail: `${entry.dialect} · ${entry.latency} ms · recent query`, icon: History, action: () => loadHistory(entry), search: `${entry.name} ${entry.sql} recent history` })),
  ].filter(item => `${item.label} ${item.search}`.toLowerCase().includes(commandSearch.toLowerCase()));
  const aliases = getAliases(config);

  return <div className="app-shell">
    <aside className="sidebar" aria-label="Main navigation"><button className="rail-logo" title="QueryPulse workspace" aria-label="QueryPulse home" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); setActiveTab('plan'); }}><Database size={24} /><span><Search size={10} /></span></button><div className="rail-divider" /><nav className="rail-nav"><button className={`rail-item ${!modal && activeTab !== 'history' ? 'active' : ''}`} onClick={() => { setModal(null); setActiveTab('plan'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Workflow size={20} /><span>Workspace</span></button><button className={`rail-item ${modal === 'schema' ? 'active' : ''}`} onClick={() => openSchema(config.table)}><Database size={20} /><span>Schema</span></button><button className={`rail-item ${activeTab === 'history' ? 'active' : ''}`} onClick={openHistory}><History size={20} /><span>History</span></button><button className={`rail-item ${modal === 'templates' ? 'active' : ''}`} onClick={() => setModal('templates')}><Layers2 size={20} /><span>Templates</span></button></nav><div className="rail-bottom"><button className="rail-item" onClick={() => setModal('guide')}><Keyboard size={19} /><span>Shortcuts</span></button><button className="rail-item" onClick={() => setModal('guide')}><BookOpen size={19} /><span>Quick guide</span></button><div className="rail-local"><span /><span>LOCAL</span></div></div></aside>
    <header className="app-header"><div className="brand-group"><a className="brand-name" href="#" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Query<span>Pulse</span><span className="brand-beta">BETA</span></a><span className="header-divider" /><div className="engine-status" title="Connected to the in-browser SQL query simulator"><span className="status-dot" />Query Engine: <strong>Connected</strong></div></div><div className="header-actions"><span className="sandbox-label"><FlaskConical size={13} />Sandbox environment</span><button className="header-guide" onClick={() => setModal('guide')}><BookOpen size={15} /><span>Quick guide</span><ArrowUpRight size={12} /></button><button className="avatar" onClick={() => setModal('guide')} title="Your local developer workspace" aria-label="About your local workspace">QP</button></div></header>
    <div className="dialect-bar"><div className="dialect-navigation"><span className="dialect-label"><Database size={13} />SQL DIALECT</span><div className="dialect-tabs" role="tablist" aria-label="SQL dialect">{DIALECTS.map((item, index) => <button key={item} role="tab" aria-selected={dialect === item} className={dialect === item ? 'active' : ''} onClick={() => changeDialect(item)} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = DIALECTS[(index + (event.key === 'ArrowRight' ? 1 : 3)) % 4]; changeDialect(next); (event.currentTarget.parentElement?.children[(index + (event.key === 'ArrowRight' ? 1 : 3)) % 4] as HTMLElement)?.focus(); } }}>{item === 'Snowflake' ? <Snowflake size={14} /> : item === 'SQLite' ? <HardDrive size={14} /> : <Database size={14} />}{item}{dialect === item && <span className="dialect-active-dot" />}</button>)}</div></div><div className="quick-actions"><button className="text-button" onClick={formatSql} title="Format SQL · Ctrl/⌘ Shift F"><AlignLeft size={15} /><span>Format SQL</span></button><span className="quick-action-divider" /><div className="export-control" ref={exportRef}><button className="export-button" onClick={() => exportReport('report')}><Download size={14} /><span>Export Query Report</span></button><button className="export-chevron" onClick={() => setExportOpen(!exportOpen)} aria-label="More export formats" aria-expanded={exportOpen}><ChevronDown size={12} /></button>{exportOpen && <div className="export-menu"><span>TAKE YOUR WORK WITH YOU</span><button onClick={() => exportReport('report')}><BookOpen size={15} /><span>Performance report<small>Markdown · SQL, plan & recommendations</small></span></button><button onClick={() => exportReport('json')}><FileJson size={15} /><span>Query & execution plan<small>JSON · structured report</small></span></button><button onClick={() => exportReport('sql')}><FileCode2 size={15} /><span>SQL script<small>.sql · current editor contents</small></span></button><button onClick={() => exportReport('csv')}><Table2 size={15} /><span>Query results<small>.csv · last executed results</small></span></button></div>}</div></div></div>
    <main className="workspace-main"><div className="workspace-content">
      <div className="workspace-heading"><div><div className="workspace-eyebrow">YOUR DATABASE, DECODED</div><h1>Query workspace<span className="heading-dot">.</span></h1><p>Build visually. Understand deeply. Run confidently.</p></div><div className="workspace-heading-actions"><button className="command-trigger" onClick={() => { setCommandSearch(''); setModal('search'); }}><Search size={14} /><span>Jump to anything</span><kbd>⌘ K</kbd></button><button className="button button-secondary new-query-button" onClick={() => setModal('templates')}><Plus size={15} />New query</button></div></div>
      <div className="workbench" id="workbench"><VisualBuilder config={config} onChange={changeBuilder} onSchema={openSchema} onNotice={message => notify(message, 'info')} /><section className={`panel editor-panel ${running ? 'editor-running' : ''}`} aria-label="SQL editor and query execution"><div className="editor-heading"><div className="editor-file"><FileCode2 size={16} /><input value={name} onChange={e => setName(e.target.value.slice(0, 60))} aria-label="Query file name" placeholder="untitled.sql" spellCheck={false} /><span className={`save-dot ${saveStatus === 'saving' ? 'saving' : ''}`} title={saveStatus === 'saved' ? 'All changes saved on this device' : saveStatus === 'saving' ? 'Saving changes' : 'Local storage unavailable'} /></div><div className="editor-heading-actions"><span className="editor-language">SQL</span><button className="text-button" onClick={() => copyText(sql, 'SQL copied to clipboard')}><Copy size={13} /><span>Copy</span></button><button className="icon-button small" onClick={() => setExpanded(true)} title="Expand SQL editor" aria-label="Expand SQL editor"><Maximize2 size={14} /></button></div></div>
        <div className="editor-context"><span><Database size={12} /><strong>analytics_db</strong><span>/</span>public</span><span className="editor-mode"><span />{parsed.error ? 'Custom SQL' : 'Live compilation'}</span></div>
        <SqlEditor value={sql} onChange={changeSql} error={queryError} suggestions={editorSuggestions} minHeight={306} />
        <div className="editor-status"><span><span className="editor-status-dialect">{dialect}</span><span className="status-separator">•</span>{sql.split('\n').length} lines<span className="status-separator">•</span>UTF-8</span><span>{saveStatus === 'saved' ? <><Check size={11} />Saved locally</> : saveStatus === 'saving' ? 'Saving…' : 'Session only'}</span></div>
        {queryError && <div className="query-error" id="sql-editor-error" role="alert"><TriangleAlert size={14} /><span>{queryError}</span></div>}
        <div className="editor-action-bar"><div className="execution-metrics"><div><Clock3 size={15} /><strong>{result.latency}<span>ms</span></strong></div><span className="metric-divider" /><div><Rows3 size={14} /><strong>{result.rows.length.toLocaleString()}</strong><span>rows</span></div>{dirty && <span className="unrun-indicator" title="Your query has changed. Run it to refresh results and costs."><span />Unrun changes</span>}</div><div className="run-action"><kbd>⌘ ↵</kbd><button className="button button-primary run-button" onClick={() => runQuery()} disabled={running || Boolean(queryError)} title={queryError || 'Run query · Ctrl/⌘ Enter'}>{running ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={13} fill="currentColor" />}{running ? 'Running query…' : 'Run query'}</button></div></div>
      </section></div>
      <section className="analysis-section" id="analysis"><div className="analysis-navigation"><div className="analysis-tabs" role="tablist" aria-label="Query analysis views"><button className={activeTab === 'plan' ? 'active' : ''} role="tab" aria-selected={activeTab === 'plan'} onClick={() => setActiveTab('plan')}><Network size={15} />Execution plan</button><button className={activeTab === 'results' ? 'active' : ''} role="tab" aria-selected={activeTab === 'results'} onClick={() => setActiveTab('results')}><Table2 size={15} />Query results<span className="tab-count">{result.rows.length.toLocaleString()}</span></button><button className={activeTab === 'history' ? 'active' : ''} role="tab" aria-selected={activeTab === 'history'} onClick={() => setActiveTab('history')}><History size={15} />Query history{history.length > 0 && <span className="tab-count">{history.length}</span>}</button></div><span className={`last-run ${dirty ? 'last-run-stale' : ''}`}>{running ? <LoaderCircle size={12} className="animate-spin" /> : dirty ? <Clock3 size={12} /> : <CircleCheck size={12} />}{running ? 'Executing your query…' : dirty ? 'Query changed · run to refresh' : result.source === 'sample' ? 'Sample execution' : `Last run at ${new Date(result.ranAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</span></div>
        <div className="analysis-grid"><div className="analysis-main" role="tabpanel">{activeTab === 'plan' ? <PlanVisualizer config={config} dialect={dialect} indexes={indexes} result={result} stale={dirty || Boolean(queryError)} running={running} /> : activeTab === 'results' ? <Results result={result} onExport={() => exportReport('csv')} /> : <QueryHistory entries={history} onLoad={loadHistory} onDelete={id => { setHistory(previous => previous.filter(entry => entry.id !== id)); notify('Query removed from history'); }} onClear={() => setModal('clear-history')} />}</div><aside className="insights-column" aria-label="Query performance insights"><PerformanceGauge score={score} onOpen={() => setModal('optimizer')} /><section className="panel optimizer-summary"><div className="optimizer-summary-heading"><span><Sparkles size={16} /><h3>Query optimizer</h3></span><span className={`tiny-badge ${pending.length ? 'badge-amber' : 'badge-emerald'}`}>{pending.length ? `${pending.length} tip${pending.length > 1 ? 's' : ''}` : 'Optimized'}</span></div><div className="optimizer-summary-content"><span className={`optimizer-tip-icon ${!firstTip ? 'optimized' : ''}`}>{firstTip ? <Zap size={16} /> : <CircleCheck size={16} />}</span><div><h4>{firstTip ? <>Missing index on <code>{firstTip.table}.{firstTip.column}</code></> : 'Your query is looking sharp'}</h4><p>{firstTip ? dialect === 'Snowflake' ? 'A clustering key could reduce the data scanned by this join.' : <>A B-tree index could make this join <strong>~45% faster.</strong></> : 'Your indexes are ready. Keep building with confidence.'}</p></div></div><div className="optimizer-checks"><span>{config.columns.some(c => c.column === '*') ? <TriangleAlert size={12} className="check-warning" /> : <Check size={12} />}{config.columns.some(c => c.column === '*') ? 'All columns selected' : 'Only essential columns selected'}</span><span>{config.limit < 0 ? <TriangleAlert size={12} className="check-warning" /> : <Check size={12} />}{config.limit >= 0 ? 'Result limit keeps things lean' : 'No result limit applied'}</span></div><button className="optimizer-review" onClick={() => setModal('optimizer')}>Review recommendations<ArrowRight size={14} /></button></section></aside></div>
      </section>
      <footer className="workspace-footer"><span><ShieldCheck size={13} />Your queries stay in your browser.</span><span><span className="footer-dot" />Local sandbox<span className="footer-separator">/</span>Simulated execution & costs</span><button onClick={() => setModal('guide')}><Keyboard size={13} />Keyboard shortcuts</button></footer>
    </div></main>
    {modal === 'optimizer' && <OptimizerDrawer config={config} dialect={dialect} indexes={indexes} score={score} onApply={applyRecommendation} onClose={() => setModal(null)} onCopy={text => copyText(text, 'Index script copied')} onDownload={text => { downloadFile(text, `querypulse-${dialect.toLowerCase()}-index.sql`, 'application/sql'); notify('Index script downloaded'); }} />}
    {modal === 'schema' && <SchemaDrawer initialTable={schemaTable} dialect={dialect} indexes={indexes} onClose={() => setModal(null)} onQuery={queryTable} />}
    {modal === 'templates' && <Modal title="A head start for your next query" subtitle="Pick a template. Explore the data. Make it your own." icon={<Layers2 size={21} />} onClose={() => setModal(null)} wide><div className="template-list">{TEMPLATES.map(template => { const Icon = template.icon === 'users' ? Users : template.icon === 'products' ? Table2 : template.icon === 'analytics' ? Activity : FileCode2; return <button className="template-card" key={template.id} onClick={() => loadTemplate(template)}><span className={`template-icon template-${template.icon}`}><Icon size={22} /></span><span><small>{template.tag}</small><strong>{template.name}</strong><p>{template.description}</p></span><ArrowUpRight size={18} /></button>; })}</div><div className="template-note"><Info size={15} />Templates use the included sample database. Your previous executions stay in History.</div></Modal>}
    {modal === 'guide' && <Modal title="A clearer path to faster queries" subtitle="Welcome to your QueryPulse workspace." icon={<BookOpen size={21} />} onClose={() => setModal(null)} wide><div className="guide-intro"><span className="guide-logo"><Database size={26} /></span><div><h3>Less guessing. More understanding.</h3><p>Build SQL visually, inspect every operation, and discover what an index can do—all in a safe, local sandbox.</p></div></div><div className="guide-steps">{[{ icon: Table2, title: 'Choose your data', text: 'Pick a source table and use the column picker to select fields or add aggregates like COUNT and SUM.' }, { icon: Network, title: 'Connect and refine', text: 'Add tables, map join keys, build WHERE filters, and choose a sort order. The SQL updates as you go.' }, { icon: Play, title: 'Run, then look deeper', text: 'Run the query to compute results. Click plan nodes to inspect costs, or switch to JSON for the full plan.' }, { icon: Sparkles, title: 'Find your next improvement', text: 'Review index recommendations, generate a dialect-specific script, and apply it in the sandbox to compare performance.' }].map((step, index) => <div key={step.title}><span className="guide-step-number">0{index + 1}</span><step.icon size={18} /><div><h4>{step.title}</h4><p>{step.text}</p></div></div>)}</div><div className="drawer-section-heading"><h3>Keep your hands on the keyboard</h3><Keyboard size={16} /></div><div className="shortcut-list">{[['Run query', 'Ctrl / ⌘ + Enter'], ['Format SQL', 'Ctrl / ⌘ + Shift + F'], ['Search workspace', 'Ctrl / ⌘ + K'], ['SQL autocomplete', 'Ctrl + Space'], ['Accept suggestion / indent', 'Tab'], ['Close dialog or drawer', 'Esc']].map(([label, shortcut]) => <div key={label}><span>{label}</span><kbd>{shortcut}</kbd></div>)}</div><details className="analysis-disclosure" open><summary><Info size={15} />About this sandbox & supported SQL</summary><p>QueryPulse computes results from 30,688 locally generated records. Execution latency, plan costs, and optimization scores are simulated. The engine supports SELECT, explicit JOIN, WHERE with AND/OR, aggregates, GROUP BY, ORDER BY, and LIMIT. Subqueries, CTEs, window functions, and data modifications are not supported. “Connected” refers to the local simulator. Recommendations use transparent local rules, not an external AI service. Always verify scripts and estimates on your own database.</p></details></Modal>}
    {modal === 'search' && <Modal title="Jump to anything" subtitle="Tables, actions, templates, and your recent queries." icon={<Search size={20} />} onClose={() => setModal(null)}><label className="search-field command-search"><Search size={18} /><input data-autofocus value={commandSearch} onChange={e => setCommandSearch(e.target.value)} onKeyDown={event => { const buttons = commandList.current?.querySelectorAll<HTMLButtonElement>('button'); if (event.key === 'Enter') { event.preventDefault(); buttons?.[0]?.click(); } else if (event.key === 'ArrowDown') { event.preventDefault(); buttons?.[0]?.focus(); } else if (event.key === 'ArrowUp') { event.preventDefault(); buttons?.[buttons.length - 1]?.focus(); } }} placeholder="What would you like to do?" aria-label="Search workspace" /></label><div className="command-list" ref={commandList} onKeyDown={event => { const buttons = Array.from(commandList.current?.querySelectorAll<HTMLButtonElement>('button') || []); const current = buttons.indexOf(document.activeElement as HTMLButtonElement); if (event.key === 'ArrowDown') { event.preventDefault(); buttons[(current + 1) % buttons.length]?.focus(); } else if (event.key === 'ArrowUp') { event.preventDefault(); buttons[(current - 1 + buttons.length) % buttons.length]?.focus(); } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); buttons[0]?.click(); } }}>{commandItems.map(item => <button key={item.id} onClick={() => { setModal(null); item.action(); }}><item.icon size={17} /><span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight size={14} /></button>)}{!commandItems.length && <div className="empty-state"><Search size={28} /><h3>No matches yet</h3><p>Try “orders”, “format”, or “template”.</p></div>}</div><div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div></Modal>}
    {modal === 'clear-history' && <Modal title="Clear your query history?" subtitle="A clean slate for your next exploration." icon={<History size={21} />} onClose={() => setModal(null)} footer={<><button className="button button-secondary" onClick={() => setModal(null)}>Keep history</button><button className="button button-danger" onClick={() => { setHistory([]); setModal(null); notify('Query history cleared'); }}>Clear {history.length} queries</button></>}><p className="confirmation-text">This removes the {history.length} saved executions from this device. Your current query, SQL editor, and applied sandbox indexes won't change.</p></Modal>}
    {expanded && <Modal title={name || 'untitled.sql'} subtitle={`${dialect} · analytics_db / public`} icon={<Code2 size={21} />} onClose={() => setExpanded(false)} wide footer={<><span className="text-muted flex items-center gap-2"><ShieldCheck size={14} />Read-only sandbox</span><div className="flex gap-2"><button className="button button-secondary" onClick={formatSql}><AlignLeft size={14} />Format SQL</button><button className="button button-primary" onClick={() => runQuery({ keepTab: true })} disabled={running || Boolean(queryError)}>{running ? <LoaderCircle className="animate-spin" size={14} /> : <Play size={14} />}Run query</button></div></>}><SqlEditor value={sql} onChange={changeSql} error={queryError} suggestions={editorSuggestions} expanded />{queryError && <div className="query-error"><TriangleAlert size={15} />{queryError}</div>}</Modal>}
    {toast && <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} key={toast.id}><span className="toast-icon">{toast.type === 'error' ? <TriangleAlert size={19} /> : toast.type === 'info' ? <Info size={19} /> : <CircleCheck size={19} />}</span><div><strong>{toast.message}</strong>{toast.detail && <p>{toast.detail}</p>}</div><button className="icon-button small" onClick={() => setToast(null)} aria-label="Dismiss notification"><X size={14} /></button></div>}
    <span className="sr-only">Current source alias: {aliases[config.table]}. QueryPulse is a local interactive SQL workspace.</span>
  </div>;
}
export default App;
