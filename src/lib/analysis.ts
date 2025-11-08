import { getAliases, SCHEMAS, type Dialect, type ExecutionResult, type QueryConfig, type TableName, toCsv } from './database';

export interface PlanNode {
  id: string;
  label: string;
  table?: TableName;
  detail: string;
  cost: number;
  rows: number;
  width: number;
  time: number;
  kind: 'aggregate' | 'join' | 'scan' | 'index' | 'sort' | 'limit';
  children: PlanNode[];
}
export interface Recommendation {
  id: string;
  kind: 'index' | 'warning' | 'success';
  title: string;
  description: string;
  impact: string;
  table?: TableName;
  column?: string;
  resolved?: boolean;
}
export const indexKey = (dialect: Dialect, table: string, column: string) => `${dialect}:${table}.${column}`;
export const hasIndex = (dialect: Dialect, table: TableName, column: string, indexes: string[]) => Boolean(SCHEMAS[table].columns.find(c => c.name === column)?.indexed || indexes.includes(indexKey(dialect, table, column)));
export function optimizationScore(config: QueryConfig, dialect: Dialect, indexes: string[]): number {
  let score = 88;
  if (config.limit < 0) score -= 8;
  if (config.columns.some(c => c.column === '*')) score -= 12;
  if (config.joins.length > 1) score -= (config.joins.length - 1) * 4;
  if (config.table === 'analytics' && !config.filters.some(f => f.table === 'analytics')) score -= 9;
  config.joins.forEach(j => { if (hasIndex(dialect, j.table, j.rightColumn, indexes)) score += 8; });
  config.filters.forEach(f => { if (hasIndex(dialect, f.table, f.column, indexes)) score += 2; });
  return Math.min(99, Math.max(32, score));
}
export function getRecommendations(config: QueryConfig, dialect: Dialect, indexes: string[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const seen = new Set<string>();
  const candidates: { table: TableName; column: string; reason: string; impact: string }[] = [];
  config.joins.forEach(j => {
    candidates.push({ table: j.table, column: j.rightColumn, reason: `The ${j.type.toLowerCase()} join reads ${SCHEMAS[j.table].rows.toLocaleString()} rows to match ${j.table}.${j.rightColumn}. A ${dialect === 'Snowflake' ? 'clustering key' : 'B-tree index'} can make these lookups more selective.`, impact: 'Up to 45% faster joins' });
    if (!SCHEMAS[j.leftTable].columns.find(c => c.name === j.leftColumn)?.primary) candidates.push({ table: j.leftTable, column: j.leftColumn, reason: 'The left side of this relationship is not indexed. An index can reduce the rows examined during the join.', impact: 'Fewer rows examined' });
  });
  config.filters.forEach(f => {
    if (['=', 'IN'].includes(f.operator) || (f.operator === 'LIKE' && !f.value.startsWith('%'))) candidates.push({ table: f.table, column: f.column, reason: `Your WHERE clause filters on ${f.table}.${f.column}. An index can help the planner find matching rows without scanning the entire table.`, impact: 'Reduce filter scan cost' });
  });
  candidates.forEach(candidate => {
    const key = `${candidate.table}.${candidate.column}`;
    if (seen.has(key)) return;
    seen.add(key);
    const resolved = hasIndex(dialect, candidate.table, candidate.column, indexes);
    recommendations.push({ id: key, kind: resolved ? 'success' : 'index', title: resolved ? `${dialect === 'Snowflake' ? 'Clustering applied' : 'Index available'} on ${key}` : `Add an index on ${key}`, description: candidate.reason, impact: resolved ? 'Ready for faster lookups' : candidate.impact, table: candidate.table, column: candidate.column, resolved });
  });
  if (config.columns.some(c => c.column === '*')) recommendations.push({ id: 'columns', kind: 'warning', title: 'Select only the columns you need', description: 'Replacing SELECT * with explicit columns reduces the amount of data read, transferred, and held in memory.', impact: 'Less I/O and memory' });
  if (config.limit < 0) recommendations.push({ id: 'limit', kind: 'warning', title: 'Give your results a limit', description: 'Add LIMIT 100 while exploring. You can increase the limit or export the complete result set when you need it.', impact: 'Smaller result transfers' });
  if (!recommendations.some(r => !r.resolved)) recommendations.push({ id: 'healthy', kind: 'success', title: 'Your query is in good shape', description: 'Selective columns, explicit joins, and a bounded result set keep this query focused. Always validate estimates against production.', impact: 'Efficient query structure', resolved: true });
  return recommendations;
}
export function indexScript(recommendation: Recommendation, dialect: Dialect): string {
  if (!recommendation.table || !recommendation.column) return '-- No additional indexes are recommended for this query.';
  const { table, column } = recommendation;
  const name = `idx_${table}_${column}`;
  if (dialect === 'Snowflake') return `-- Snowflake uses automatic micro-partitioning, not B-tree indexes.\n-- Consider clustering only for large, frequently filtered tables.\n-- Review credit costs before applying in production.\nALTER TABLE ${table} CLUSTER BY (${column});`;
  if (dialect === 'PostgreSQL') return `-- Run outside an explicit transaction.\nCREATE INDEX CONCURRENTLY IF NOT EXISTS ${name}\nON ${table} USING btree (${column});`;
  if (dialect === 'SQLite') return `CREATE INDEX IF NOT EXISTS ${name}\nON ${table} (${column});`;
  return `CREATE INDEX ${name}\nON ${table} (${column});`;
}
const round = (value: number) => Number(value.toFixed(2));
export function makePlan(config: QueryConfig, dialect: Dialect, indexes: string[], latency: number, matchedRows: number): PlanNode {
  const aliases = getAliases(config);
  const aggregate = config.columns.some(c => c.aggregate);
  const leafCosts: number[] = [];
  const makeScan = (table: TableName): PlanNode => {
    const filters = config.filters.filter(f => f.table === table);
    const incomingJoin = config.joins.find(j => j.table === table);
    const selectiveFilter = filters.find(f => (['=', 'IN'].includes(f.operator) || (f.operator === 'LIKE' && !f.value.startsWith('%'))) && hasIndex(dialect, table, f.column, indexes));
    const filterColumn = selectiveFilter?.column || incomingJoin?.rightColumn || filters[0]?.column || 'id';
    const indexed = hasIndex(dialect, table, filterColumn, indexes) && (Boolean(selectiveFilter) || Boolean(incomingJoin));
    const selectivity = filters.length ? filters[0].operator === '=' ? 0.12 : filters[0].operator === '>' || filters[0].operator === '<' ? 0.7 : 0.4 : 1;
    const rows = Math.max(1, Math.round(SCHEMAS[table].rows * selectivity));
    const cost = round(indexed ? 3.2 + rows * 0.004 : 4 + rows * (table === 'analytics' ? 0.018 : 0.012));
    leafCosts.push(cost);
    const label = dialect === 'SQLite' ? `${indexed ? 'SEARCH' : 'SCAN'} ${table}` : dialect === 'Snowflake' ? `${indexed ? 'PartitionScan' : 'TableScan'} on ${table}` : `${indexed ? 'Index Scan' : 'Seq Scan'} on ${table}`;
    return { id: `scan-${table}`, label, table, detail: indexed ? `using ${table === 'users' && filterColumn === 'email' ? 'idx_users_email' : `idx_${table}_${filterColumn}`}` : filters.length ? `Filter: ${aliases[table]}.${filters[0].column} ${filters[0].operator} ${filters[0].value}` : `Read all rows from ${table}`, cost, rows: indexed ? Math.max(1, Math.round(rows * 0.72)) : rows, width: table === 'users' ? 64 : 32, time: round(latency * cost / 150), kind: indexed ? 'index' : 'scan', children: [] };
  };
  let child = makeScan(config.table);
  config.joins.forEach((join, i) => {
    const scan = makeScan(join.table);
    const rows = Math.max(1, Math.round(Math.max(child.rows, scan.rows) * (join.type === 'INNER' ? 0.85 : 1)));
    const cost = round(child.cost + scan.cost + rows * 0.006 + 9.8);
    const label = dialect === 'Snowflake' ? `${join.type} Join` : dialect === 'SQLite' ? `${join.type} JOIN` : `Hash ${join.type === 'INNER' ? '' : join.type + ' '}Join`;
    child = { id: `join-${i}`, label: label.replace(/\s+/g, ' '), detail: `${aliases[join.leftTable]}.${join.leftColumn} = ${join.alias}.${join.rightColumn}`, cost, rows, width: 96, time: round(latency * 0.76), kind: 'join', children: [child, scan] };
  });
  if (aggregate) {
    const rows = Math.max(1, matchedRows);
    const cost = round(child.cost + 13.2 + rows * 0.008);
    child = { id: 'aggregate', label: dialect === 'MySQL' ? 'Group Aggregate' : dialect === 'Snowflake' ? 'Aggregate' : 'HashAggregate', detail: `Group key: ${config.columns.filter(c => !c.aggregate && c.column !== '*').map(c => `${aliases[c.table]}.${c.column}`).join(', ') || 'entire result'}`, cost, rows, width: 48, time: round(latency * 0.91), kind: 'aggregate', children: [child] };
  }
  if (config.order.field) child = { id: 'sort', label: 'Sort', detail: `${config.order.field} ${config.order.direction}`, cost: round(child.cost + 5.4 + Math.log2(Math.max(2, matchedRows)) * 0.5), rows: Math.max(1, matchedRows), width: 48, time: round(latency * 0.96), kind: 'sort', children: [child] };
  if (config.limit >= 0) child = { id: 'limit', label: 'Limit', detail: `Return up to ${config.limit.toLocaleString()} rows`, cost: round(child.cost + 0.3), rows: Math.min(config.limit, Math.max(0, matchedRows)), width: 48, time: latency, kind: 'limit', children: [child] };
  return child;
}
export function flattenPlan(node: PlanNode): PlanNode[] { return [...node.children.flatMap(flattenPlan), node]; }
export function planJson(node: PlanNode, dialect: Dialect, analyze: boolean): string {
  const map = (n: PlanNode): Record<string, unknown> => ({ 'Node Type': n.label, ...(n.table ? { 'Relation Name': n.table } : {}), 'Total Cost': n.cost, 'Plan Rows': n.rows, 'Plan Width': n.width, ...(analyze ? { 'Actual Total Time': n.time, 'Actual Rows': n.rows } : {}), 'Description': n.detail, ...(n.children.length ? { Plans: n.children.map(map) } : {}) });
  return JSON.stringify(dialect === 'PostgreSQL' ? [{ Plan: map(node), PlanningTime: 1.24 }] : { dialect, simulated: true, QueryPlan: map(node) }, null, 2);
}
export function estimatedLatency(config: QueryConfig, dialect: Dialect, indexes: string[]): number {
  let time = config.joins.length ? 142 : config.table === 'analytics' ? 196 : 38;
  time += Math.max(0, config.joins.length - 1) * 67;
  if (!config.limit) time += 19;
  config.joins.forEach(j => { if (hasIndex(dialect, j.table, j.rightColumn, indexes)) time *= 0.58; });
  if (dialect === 'Snowflake') time *= 1.22;
  if (dialect === 'SQLite') time *= 0.83;
  return Math.max(8, Math.round(time));
}
function markdownTable(headers: string[], rows: unknown[][]): string {
  return `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map(row => `| ${row.map(v => String(v ?? 'NULL').replace(/\|/g, '\\|')).join(' | ')} |`).join('\n')}`;
}
export function queryReport(result: ExecutionResult, score: number): string {
  const plan = makePlan(result.config, result.dialect, result.indexes, result.latency, result.totalMatched);
  const recommendations = getRecommendations(result.config, result.dialect, result.indexes);
  return `# QueryPulse — Query performance report\n\nGenerated: ${new Date(result.ranAt).toISOString()}\n\n> Local sandbox analysis. Timings and execution plans are simulated; results are computed from the sample database. This is not a production database connection.\n\n## Summary\n\n- Dialect: ${result.dialect}\n- Optimization score: ${score}/100\n- Simulated execution time: ${result.latency} ms\n- Returned rows: ${result.rows.length}\n- Matching rows before LIMIT: ${result.totalMatched}\n- Total estimated cost: ${plan.cost}\n\n## SQL\n\n\`\`\`sql\n${result.sql}\n\`\`\`\n\n## Execution plan\n\n${markdownTable(['Operation', 'Estimated cost', 'Rows', 'Description'], flattenPlan(plan).reverse().map(n => [n.label, n.cost, n.rows, n.detail]))}\n\n## Optimization recommendations\n\n${recommendations.map(r => `### ${r.title}\n\n${r.description}\n\n${r.impact}${r.table ? `\n\n\`\`\`sql\n${indexScript(r, result.dialect)}\n\`\`\`` : ''}`).join('\n\n')}\n\n## Result preview\n\n${markdownTable(result.columns.map(c => c.key), result.rows.slice(0, 15).map(row => result.columns.map(c => row[c.key])))}\n\n---\nBuilt with QueryPulse. Your data stays in your browser.\n`;
}
export function csvReport(result: ExecutionResult): string { return toCsv(result.columns, result.rows); }
