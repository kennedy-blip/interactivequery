import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, Braces, CircleHelp, GitMerge, Layers2, ListTree, Network, ScanLine, Table2, Zap } from 'lucide-react';
import { flattenPlan, makePlan, planJson, type PlanNode } from '../lib/analysis';
import { type Dialect, type ExecutionResult, type QueryConfig } from '../lib/database';
import { highlightSql } from './SqlEditor';
import { Toggle } from './UI';

function PlanNodeCard({ node, selected, onSelect, root = false }: { node: PlanNode; selected: boolean; onSelect: () => void; root?: boolean }) {
  const Icon = node.kind === 'aggregate' ? Layers2 : node.kind === 'join' ? GitMerge : node.kind === 'index' ? Zap : node.kind === 'sort' || node.kind === 'limit' ? ArrowDown : Table2;
  return <button className={`plan-node node-${node.kind} ${selected ? 'node-selected' : ''} ${root ? 'node-root' : ''}`} onClick={onSelect} title={`${node.label} · ${node.detail}`} aria-pressed={selected}>
    <span className="plan-node-title"><Icon size={14} /><strong>{node.label}</strong>{node.kind === 'scan' && <span className="node-warning-dot" />}</span>
    <span className="plan-node-detail">{node.detail}</span>
    <span className="plan-node-metrics"><span>Cost <b>{node.cost.toFixed(2)}</b></span><span className="node-metric-divider" /><span>Rows <b>{node.rows.toLocaleString()}</b></span></span>
  </button>;
}
export function PlanVisualizer({ config, dialect, indexes, result, stale, running }: { config: QueryConfig; dialect: Dialect; indexes: string[]; result: ExecutionResult; stale: boolean; running: boolean }) {
  const [analyze, setAnalyze] = useState(true);
  const [view, setView] = useState<'tree' | 'json'>('tree');
  const [selectedId, setSelectedId] = useState('aggregate');
  const plan = useMemo(() => makePlan(config, dialect, indexes, result.latency, result.totalMatched), [config, dialect, indexes, result.latency, result.totalMatched]);
  const nodes = useMemo(() => flattenPlan(plan), [plan]);
  const selected = nodes.find(n => n.id === selectedId) || plan;
  let primary = plan;
  const wrappers: PlanNode[] = [];
  while ((primary.kind === 'limit' || primary.kind === 'sort') && primary.children.length) { wrappers.push(primary); primary = primary.children[0]; }
  const displayedRoot = { ...primary, cost: plan.cost, rows: plan.rows, time: plan.time };
  const join = primary.children[0];
  const isTree = config.joins.length === 1 && join?.kind === 'join';
  const isMultiStep = config.joins.length > 1;
  useEffect(() => { setSelectedId(primary.id); }, [primary.id]);
  const scanCost = nodes.filter(n => n.table).reduce((sum, n) => sum + n.cost, 0);
  const scanPercent = Math.round(scanCost / plan.cost * 100);
  return <section className={`panel plan-panel ${running ? 'plan-running' : ''}`} aria-label="Execution plan and cost visualizer" aria-busy={running}>
    <div className="analysis-card-heading"><div className="flex items-center gap-2.5"><Network size={17} className="text-indigo-400" /><h3>Execution plan</h3><span className={`tiny-badge ${stale ? 'badge-amber' : 'badge-emerald'}`}>{stale ? 'Preview' : 'Completed'}</span></div><span className="help-icon" title="Click an operation to inspect its cost. Plans and timings are simulated, not production EXPLAIN output." tabIndex={0}><CircleHelp size={15} /></span></div>
    <div className="plan-toolbar"><div className="plan-cost">Total cost <strong>{plan.cost.toFixed(2)}</strong><span className="cost-unit">units</span></div><div className="flex items-center gap-4"><Toggle checked={analyze} onChange={() => setAnalyze(!analyze)} label="Analyze" /><div className="segmented-control"><button className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')} aria-pressed={view === 'tree'}><ListTree size={13} />Tree</button><button className={view === 'json' ? 'active' : ''} onClick={() => setView('json')} aria-pressed={view === 'json'}><Braces size={13} />JSON</button></div></div></div>
    {view === 'json' ? <pre className="plan-json"><code>{highlightSql(planJson(plan, dialect, analyze))}</code></pre> : <div className="plan-canvas">
      {isTree ? <div className="plan-tree">
        <svg className="tree-connectors" viewBox="0 0 600 250" preserveAspectRatio="none" aria-hidden="true"><path d="M300 68 V91 M300 159 V171 H150 V182 M300 171 H450 V182" /><circle cx="300" cy="171" r="3" /></svg>
        <div className="tree-level"><PlanNodeCard node={displayedRoot} root selected={selected.id === displayedRoot.id} onSelect={() => setSelectedId(displayedRoot.id)} /></div>
        <div className="tree-level"><PlanNodeCard node={join} selected={selected.id === join.id} onSelect={() => setSelectedId(join.id)} /></div>
        <div className="tree-leaves">{join.children.map(node => <PlanNodeCard key={node.id} node={node} selected={selected.id === node.id} onSelect={() => setSelectedId(node.id)} />)}</div>
      </div> : <div className={`plan-steps ${isMultiStep ? 'multi-step-plan' : ''}`}>
        {(isMultiStep ? [...nodes].reverse() : [displayedRoot, ...primary.children]).map((node, index) => <div className="plan-step" key={node.id}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><PlanNodeCard node={node.id === primary.id ? displayedRoot : node} root={node.id === primary.id} selected={selected.id === node.id} onSelect={() => setSelectedId(node.id)} />{index < (isMultiStep ? nodes.length - 1 : primary.children.length) && <ArrowDown className="step-arrow" size={14} />}</div>)}
      </div>}
      <div className="plan-canvas-caption"><span><ScanLine size={12} />{wrappers.length ? wrappers.map(n => n.kind === 'limit' ? `Limit ${config.limit.toLocaleString()}` : `Sort ${config.order.direction}`).join(' · ') : 'Query output'}</span><span>Click a node to inspect</span></div>
    </div>}
    <div className="node-inspector"><div className="node-inspector-title"><span className={`legend-dot legend-${selected.kind}`} /><strong>{selected.label}</strong><span className="inspector-hint">{analyze ? 'Actual time' : 'Estimated time'} <b>{selected.time.toFixed(1)} ms</b></span></div><p>{selected.detail}</p></div>
    <div className="cost-breakdown"><div className="cost-breakdown-label"><span>Cost distribution</span><span><b>{scanPercent}%</b> table & index scans</span></div><div className="cost-bar" aria-label={`${scanPercent}% scan cost, ${100 - scanPercent}% join and aggregate cost`}><span className="cost-scan" style={{ width: `${scanPercent}%` }} /><span className="cost-join" style={{ width: `${(100 - scanPercent) * 0.58}%` }} /><span className="cost-aggregate" style={{ width: `${(100 - scanPercent) * 0.42}%` }} /></div><div className="cost-legend"><span><i className="legend-scan" />Scans</span><span><i className="legend-join" />Joins</span><span><i className="legend-aggregate" />Aggregation & other</span></div></div>
  </section>;
}
