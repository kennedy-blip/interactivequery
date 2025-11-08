import { useState } from 'react';
import { ArrowDownWideNarrow, Check, ChevronDown, Columns3, Database, Filter as FilterIcon, GitMerge, Layers2, Link2, Plus, RotateCcw, Table2, Trash2, Workflow, X } from 'lucide-react';
import { availableTables, cloneConfig, DEFAULT_CONFIG, getAliases, getOutputs, inferJoin, SCHEMAS, TABLE_NAMES, uid, type Aggregate, type FilterOperator, type JoinType, type QueryConfig, type Selection, type TableName } from '../lib/database';
import { Modal, SelectField } from './UI';

interface BuilderProps { config: QueryConfig; onChange: (config: QueryConfig) => void; onSchema: (table: TableName) => void; onNotice: (message: string) => void }
export function VisualBuilder({ config, onChange, onSchema, onNotice }: BuilderProps) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const aliases = getAliases(config);
  const tables = availableTables(config);
  const outputs = getOutputs(config);
  const grouped = config.columns.filter(c => !c.aggregate && c.column !== '*');
  const hasAggregate = config.columns.some(c => c.aggregate);
  function update(patch: Partial<QueryConfig>) {
    const next = { ...cloneConfig(config), ...patch };
    if (!getOutputs(next).some(output => output.key === next.order.field) && !next.order.field.includes('.')) next.order = { field: getOutputs(next)[0]?.key || 'id', direction: 'ASC' };
    onChange(next);
  }
  function changeSource(table: TableName) {
    const columns: Selection[] = SCHEMAS[table].columns.slice(0, 2).map(c => ({ id: uid(), table, column: c.name }));
    onChange({ table, alias: table[0], columns, joins: [], filters: [], filterLogic: 'AND', order: { field: 'id', direction: 'ASC' }, limit: 100 });
    onNotice(`Now querying ${table}. Add a join or filter to refine your query.`);
  }
  function toggleTable(table: TableName) {
    if (table === config.table) { onSchema(table); return; }
    const next = cloneConfig(config);
    if (tables.includes(table)) {
      const removed = new Set<TableName>([table]);
      let changed = true;
      while (changed) { changed = false; next.joins.forEach(j => { if (removed.has(j.leftTable) && !removed.has(j.table)) { removed.add(j.table); changed = true; } }); }
      next.joins = next.joins.filter(j => !removed.has(j.table));
      next.columns = next.columns.filter(c => !removed.has(c.table));
      next.filters = next.filters.filter(f => !removed.has(f.table));
      if (!next.columns.length) next.columns = [{ id: uid(), table: next.table, column: 'id' }];
      if (!getOutputs(next).some(o => o.key === next.order.field)) next.order = { field: getOutputs(next)[0].key, direction: 'ASC' };
      onNotice(`${table} removed, along with dependent columns and filters.`);
    } else {
      next.joins.push({ ...inferJoin(table, tables), id: uid(), alias: table[0], type: 'LEFT' });
      onNotice(`${table} joined. Choose its columns with the column picker.`);
    }
    onChange(next);
  }
  function addJoin() { const table = TABLE_NAMES.find(t => !tables.includes(t)); if (table) toggleTable(table); }
  function addFilter() {
    const column = config.table === 'users' ? 'status' : SCHEMAS[config.table].columns[1].name;
    const value = column === 'status' ? 'active' : column === 'event_type' ? 'page_view' : '0';
    update({ filters: [...config.filters, { id: uid(), table: config.table, column, operator: column === 'status' || column === 'event_type' ? '=' : '>', value }] });
  }
  const suggestions: Record<string, string[]> = { status: config.filters.some(f => f.table === 'orders') ? ['completed', 'pending', 'refunded'] : ['active', 'trial', 'inactive'], country: ['US', 'GB', 'CA', 'DE', 'AU', 'FR', 'IN', 'BR'], event_type: ['page_view', 'add_to_cart', 'purchase', 'sign_up'], category: ['Electronics', 'Accessories', 'Workspace', 'Storage'] };
  return <>
    <section className="panel builder-panel" aria-label="Visual query builder">
      <div className="builder-heading"><div className="flex items-center gap-2.5"><Workflow size={17} className="text-indigo-400" /><h3>Visual builder</h3></div><div className="flex items-center gap-3"><button className="columns-button" onClick={() => setColumnsOpen(true)}><Columns3 size={13} />{config.columns.length} columns<ChevronDown size={11} /></button><button className="icon-button small" onClick={() => { onChange(cloneConfig(DEFAULT_CONFIG)); onNotice('Visual builder reset to the customer spend query.'); }} title="Reset to the default query" aria-label="Reset visual builder"><RotateCcw size={14} /></button></div></div>
      <div className="builder-content">
        <div className="builder-section source-section"><div className="section-label"><span><span className="step-label">01</span> FROM</span><button className="subtle-link" onClick={() => onSchema(config.table)}>Explore schema <Link2 size={11} /></button></div>
          <div className="source-select"><Database size={15} /><SelectField label="Source table" value={config.table} onChange={value => changeSource(value as TableName)}>{TABLE_NAMES.map(t => <option key={t} value={t}>{t}</option>)}</SelectField><span className="source-alias">AS {config.alias}</span><span className="source-row-count">{SCHEMAS[config.table].rows.toLocaleString()} rows</span></div>
          <div className="table-chips">{TABLE_NAMES.map(table => <button key={table} className={`table-chip ${table === config.table ? 'chip-source' : tables.includes(table) ? 'chip-joined' : ''}`} onClick={() => toggleTable(table)} title={table === config.table ? `Inspect ${table} schema` : tables.includes(table) ? `Remove ${table} and its dependencies` : `Join ${table} to your query`}>{table === config.table ? <Check size={11} /> : tables.includes(table) ? <Link2 size={11} /> : <Plus size={11} />}{table}</button>)}</div>
        </div>
        <div className="builder-section join-section"><div className="section-label"><span><span className="step-label">02</span> JOIN <span className="label-detail">Connect your data</span></span><button className="subtle-link" onClick={addJoin} disabled={tables.length === 4}><Plus size={12} />Add join</button></div>
          {!config.joins.length && <button className="add-join-placeholder" onClick={addJoin}><GitMerge size={14} />Connect another table<Plus size={13} /></button>}
          {config.joins.map(join => <div className="join-block" key={join.id}><div className="join-top"><SelectField label={`Join type for ${join.table}`} value={join.type} onChange={value => update({ joins: config.joins.map(j => j.id === join.id ? { ...j, type: value as JoinType } : j) })} className="join-type-select">{['INNER', 'LEFT', 'RIGHT', 'FULL'].map(type => <option key={type} value={type}>{type}</option>)}</SelectField><span className="join-word">JOIN</span><button className="join-table-name" onClick={() => onSchema(join.table)} title={`Inspect ${join.table} schema`}>{join.table}<span>{join.alias}</span></button><button className="icon-button small ml-auto" onClick={() => toggleTable(join.table)} aria-label={`Remove ${join.table} join`} title="Remove join"><X size={13} /></button></div><div className="join-condition"><Link2 size={12} /><SelectField label={`Left column for ${join.table} join`} value={`${join.leftTable}.${join.leftColumn}`} onChange={value => { const [leftTable, leftColumn] = value.split('.'); update({ joins: config.joins.map(j => j.id === join.id ? { ...j, leftTable: leftTable as TableName, leftColumn } : j) }); }}>{tables.filter(t => t !== join.table).flatMap(t => SCHEMAS[t].columns.map(c => <option value={`${t}.${c.name}`} key={`${t}.${c.name}`}>{aliases[t]}.{c.name}</option>))}</SelectField><span className="join-equals">=</span><SelectField label={`Right column for ${join.table} join`} value={join.rightColumn} onChange={value => update({ joins: config.joins.map(j => j.id === join.id ? { ...j, rightColumn: value } : j) })}>{SCHEMAS[join.table].columns.map(c => <option value={c.name} key={c.name}>{join.alias}.{c.name}</option>)}</SelectField></div></div>)}
        </div>
        <div className="builder-section filter-section"><div className="section-label"><span><span className="step-label">03</span> WHERE {config.filters.length > 1 && <SelectField label="Filter combination" className="logic-select" value={config.filterLogic} onChange={value => update({ filterLogic: value as 'AND' | 'OR' })}><option value="AND">AND</option><option value="OR">OR</option></SelectField>}</span><button className="subtle-link" onClick={addFilter}><Plus size={12} />Add filter</button></div>
          {!config.filters.length && <button className="add-filter-placeholder" onClick={addFilter}><FilterIcon size={13} />Add a condition to narrow your results</button>}
          {config.filters.map(filter => <div className="filter-row" key={filter.id}><SelectField label="Filter column" className="filter-field" value={`${filter.table}.${filter.column}`} onChange={value => { const [table, column] = value.split('.'); update({ filters: config.filters.map(f => f.id === filter.id ? { ...f, table: table as TableName, column, value: column === 'status' ? 'active' : '0' } : f) }); }}>{tables.flatMap(table => SCHEMAS[table].columns.map(c => <option value={`${table}.${c.name}`} key={`${table}.${c.name}`}>{aliases[table]}.{c.name}</option>))}</SelectField><SelectField label="Filter operator" className="filter-operator" value={filter.operator} onChange={value => update({ filters: config.filters.map(f => f.id === filter.id ? { ...f, operator: value as FilterOperator } : f) })}>{['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN', 'IS NULL', 'IS NOT NULL'].map(op => <option key={op}>{op}</option>)}</SelectField><input className="field-input filter-value" aria-label={`Value for ${filter.table}.${filter.column}`} type={['integer', 'decimal'].includes(SCHEMAS[filter.table].columns.find(c => c.name === filter.column)?.type || '') && !['IN', 'IS NULL', 'IS NOT NULL'].includes(filter.operator) ? 'number' : 'text'} step="any" value={filter.value} placeholder={['IS NULL', 'IS NOT NULL'].includes(filter.operator) ? '—' : filter.operator === 'IN' ? '1, 2, 3' : 'Value'} disabled={['IS NULL', 'IS NOT NULL'].includes(filter.operator)} onChange={e => update({ filters: config.filters.map(f => f.id === filter.id ? { ...f, value: e.target.value } : f) })} list={`suggestions-${filter.id}`} /><datalist id={`suggestions-${filter.id}`}>{(suggestions[filter.column] || []).map(value => <option value={value} key={value} />)}</datalist><button className="icon-button small" onClick={() => update({ filters: config.filters.filter(f => f.id !== filter.id) })} aria-label={`Remove ${filter.column} filter`} title="Remove filter"><Trash2 size={13} /></button></div>)}
        </div>
        <div className="builder-section order-section"><div className="section-label"><span><span className="step-label">04</span> ORDER BY</span><span className="label-detail">Make it meaningful</span></div><div className="order-controls"><span className="order-icon"><ArrowDownWideNarrow size={15} /></span><SelectField label="Sort column" className="order-field" value={config.order.field} onChange={value => update({ order: { ...config.order, field: value } })}><option value="">No sorting</option>{outputs.map(output => <option value={output.key} key={output.key}>{output.key}</option>)}{config.order.field.includes('.') && <option value={config.order.field}>{config.order.field}</option>}</SelectField><SelectField label="Sort direction" value={config.order.direction} onChange={value => update({ order: { ...config.order, direction: value as 'ASC' | 'DESC' } })}><option value="DESC">DESC ↓</option><option value="ASC">ASC ↑</option></SelectField><span className="limit-label">Limit</span><input className="field-input limit-input" type="number" min={0} max={10000} aria-label="Result row limit" title="Leave blank for all rows. Use 0 to return no rows." placeholder="All" value={config.limit < 0 ? '' : config.limit} onChange={e => update({ limit: e.target.value === '' ? -1 : Number(e.target.value) })} /></div></div>
      </div>
      <div className="builder-footer"><Layers2 size={12} /><span>{hasAggregate && grouped.length ? <>Group by <code>{grouped.map(c => `${aliases[c.table]}.${c.column}`).join(', ')}</code></> : 'No grouping applied'}</span><span className="auto-badge" title="Non-aggregated columns are grouped automatically">{hasAggregate ? 'AUTO' : 'SQL'}</span></div>
    </section>
    {columnsOpen && <ColumnPicker config={config} onClose={() => setColumnsOpen(false)} onApply={columns => { update({ columns }); setColumnsOpen(false); onNotice(`${columns.length} column expressions selected.`); }} />}
  </>;
}

function ColumnPicker({ config, onApply, onClose }: { config: QueryConfig; onApply: (columns: Selection[]) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(cloneConfig(config));
  const [table, setTable] = useState<TableName>(config.table);
  const aliases = getAliases(draft);
  const numeric = (column: string) => ['integer', 'decimal'].includes(SCHEMAS[table].columns.find(c => c.name === column)?.type || '');
  function toggle(column: string) { setDraft(previous => ({ ...previous, columns: previous.columns.some(c => c.table === table && c.column === column) ? previous.columns.filter(c => !(c.table === table && c.column === column)) : [...previous.columns, { id: uid(), table, column }] })); }
  function aggregate(selection: Selection, value: string) { setDraft(previous => ({ ...previous, columns: previous.columns.map(c => c.id === selection.id ? { ...c, aggregate: (value || undefined) as Aggregate | undefined, alias: value ? `${value.toLowerCase()}_${c.column === '*' ? 'rows' : c.column}` : undefined } : c) })); }
  return <Modal title="Select your columns" subtitle="Choose the data you want to see. Leave the rest behind." icon={<Columns3 size={21} />} onClose={onClose} wide footer={<><span className="text-muted">{draft.columns.length} expressions selected</span><div className="flex gap-2"><button className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!draft.columns.length} onClick={() => onApply(draft.columns)}><Check size={15} />Apply columns</button></div></>}>
    <div className="selected-columns">{draft.columns.map(c => <span key={c.id} className="selected-column"><code>{c.aggregate ? `${c.aggregate}(${c.column === '*' ? '*' : `${aliases[c.table]}.${c.column}`})` : c.column === '*' ? `${aliases[c.table]}.*` : `${aliases[c.table]}.${c.column}`}</code><button aria-label={`Remove ${c.alias || c.column} column`} onClick={() => setDraft(p => ({ ...p, columns: p.columns.filter(item => item.id !== c.id) }))}><X size={11} /></button></span>)}</div>
    <div className="schema-table-tabs">{availableTables(draft).map(t => <button className={t === table ? 'active' : ''} onClick={() => setTable(t)} key={t}><Table2 size={14} />{t}<span>{aliases[t]}</span></button>)}</div>
    <div className="column-picker-list"><div className="column-list-heading"><span>{table.toUpperCase()} COLUMNS</span><span>AGGREGATE</span></div>{SCHEMAS[table].columns.map(column => {
      const selection = draft.columns.find(c => c.table === table && c.column === column.name);
      return <div className={`column-picker-row ${selection ? 'selected' : ''}`} key={column.name}><label><input type="checkbox" checked={Boolean(selection)} onChange={() => toggle(column.name)} /><code>{column.name}</code><span>{column.type}</span>{column.primary && <span className="key-badge">PK</span>}</label>{selection ? <><SelectField label={`Aggregate for ${column.name}`} value={selection.aggregate || ''} onChange={value => aggregate(selection, value)}><option value="">No aggregate</option>{['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'].map(a => <option key={a} disabled={['SUM', 'AVG'].includes(a) && !numeric(column.name)}>{a}</option>)}</SelectField>{selection.aggregate && <input className="field-input alias-input" value={selection.alias || ''} placeholder="Column alias" aria-label={`Alias for ${column.name}`} onChange={e => setDraft(p => ({ ...p, columns: p.columns.map(c => c.id === selection.id ? { ...c, alias: e.target.value.replace(/[^\w]/g, '') } : c) }))} />}</> : <span className="column-not-selected">Not selected</span>}</div>;
    })}</div>
    <div className="column-picker-note"><Layers2 size={16} /><p>When you add an aggregate, QueryPulse automatically groups by your other selected columns.</p></div>
    <button className="button button-secondary" onClick={() => setDraft(p => ({ ...p, columns: [...p.columns, { id: uid(), table, column: '*', aggregate: 'COUNT', alias: 'row_count' }] }))}><Plus size={14} />Add COUNT(*)</button>
    
  </Modal>;
}
