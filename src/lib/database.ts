export const DIALECTS = ['PostgreSQL', 'MySQL', 'SQLite', 'Snowflake'] as const;
export type Dialect = (typeof DIALECTS)[number];
export type TableName = 'users' | 'orders' | 'products' | 'analytics';
export type DataRow = Record<string, string | number | null>;
export type Aggregate = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
export type FilterOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IS NULL' | 'IS NOT NULL' | 'IN';
export interface ColumnSchema { name: string; type: string; primary?: boolean; indexed?: boolean; description: string }
export interface TableSchema { name: TableName; rows: number; description: string; columns: ColumnSchema[] }
export interface Selection { id: string; table: TableName; column: string; aggregate?: Aggregate; alias?: string }
export interface Join { id: string; table: TableName; alias: string; type: JoinType; leftTable: TableName; leftColumn: string; rightColumn: string }
export interface Filter { id: string; table: TableName; column: string; operator: FilterOperator; value: string }
export interface QueryConfig {
  table: TableName;
  alias: string;
  columns: Selection[];
  joins: Join[];
  filters: Filter[];
  filterLogic: 'AND' | 'OR';
  order: { field: string; direction: 'ASC' | 'DESC' };
  limit: number;
}
export interface QueryOutput { key: string; label: string; type: 'number' | 'text'; selection?: Selection }
export interface ExecutionResult {
  rows: DataRow[];
  columns: QueryOutput[];
  totalMatched: number;
  rowsScanned: number;
  latency: number;
  ranAt: number;
  sql: string;
  config: QueryConfig;
  dialect: Dialect;
  indexes: string[];
  source: 'sample' | 'manual';
}

export const SCHEMAS: Record<TableName, TableSchema> = {
  users: { name: 'users', rows: 1200, description: 'People, profiles, and account activity', columns: [
    { name: 'id', type: 'integer', primary: true, indexed: true, description: 'Unique customer identifier' },
    { name: 'name', type: 'varchar', description: 'Customer display name' },
    { name: 'email', type: 'varchar', indexed: true, description: 'Unique email address' },
    { name: 'status', type: 'varchar', description: 'active, trial, or inactive' },
    { name: 'country', type: 'varchar', description: 'Two-letter country code' },
    { name: 'created_at', type: 'timestamp', description: 'Account creation time' },
  ] },
  orders: { name: 'orders', rows: 4860, description: 'Customer orders and transaction totals', columns: [
    { name: 'id', type: 'integer', primary: true, indexed: true, description: 'Unique order identifier' },
    { name: 'user_id', type: 'integer', description: 'References users.id' },
    { name: 'product_id', type: 'integer', description: 'References products.id' },
    { name: 'total', type: 'decimal', description: 'Order total in USD' },
    { name: 'status', type: 'varchar', description: 'completed, pending, or refunded' },
    { name: 'created_at', type: 'timestamp', description: 'Order creation time' },
  ] },
  products: { name: 'products', rows: 128, description: 'Your product catalog and inventory', columns: [
    { name: 'id', type: 'integer', primary: true, indexed: true, description: 'Unique product identifier' },
    { name: 'name', type: 'varchar', description: 'Product name' },
    { name: 'category', type: 'varchar', description: 'Product category' },
    { name: 'price', type: 'decimal', description: 'Unit price in USD' },
    { name: 'stock', type: 'integer', description: 'Available inventory' },
  ] },
  analytics: { name: 'analytics', rows: 24500, description: 'Product events and customer journeys', columns: [
    { name: 'id', type: 'integer', primary: true, indexed: true, description: 'Unique event identifier' },
    { name: 'user_id', type: 'integer', description: 'References users.id' },
    { name: 'event_type', type: 'varchar', description: 'page_view, add_to_cart, purchase, or sign_up' },
    { name: 'page', type: 'varchar', description: 'Page path' },
    { name: 'duration_ms', type: 'integer', description: 'Time spent on the page' },
    { name: 'created_at', type: 'timestamp', description: 'Event timestamp' },
  ] },
};
export const TABLE_NAMES = Object.keys(SCHEMAS) as TableName[];
let sequence = 0;
export const uid = () => `${Date.now().toString(36)}-${(++sequence).toString(36)}`;
export const cloneConfig = (config: QueryConfig): QueryConfig => JSON.parse(JSON.stringify(config));
export const DEFAULT_CONFIG: QueryConfig = {
  table: 'users', alias: 'u',
  columns: [
    { id: 'c-id', table: 'users', column: 'id' },
    { id: 'c-name', table: 'users', column: 'name' },
    { id: 'c-count', table: 'orders', column: 'id', aggregate: 'COUNT', alias: 'order_count' },
    { id: 'c-total', table: 'orders', column: 'total', aggregate: 'SUM', alias: 'total_spent' },
  ],
  joins: [{ id: 'j-orders', table: 'orders', alias: 'o', type: 'INNER', leftTable: 'users', leftColumn: 'id', rightColumn: 'user_id' }],
  filters: [{ id: 'f-total', table: 'orders', column: 'total', operator: '>', value: '0' }],
  filterLogic: 'AND', order: { field: 'total_spent', direction: 'DESC' }, limit: 100,
};

let dataset: Record<TableName, DataRow[]> | undefined;
export function getDataset(): Record<TableName, DataRow[]> {
  if (dataset) return dataset;
  const first = ['Alex', 'Emma', 'Liam', 'Olivia', 'Noah', 'Amelia', 'James', 'Sophia', 'Lucas', 'Isabella', 'Ethan', 'Mia', 'Oliver', 'Charlotte', 'Leo', 'Ava', 'Arjun', 'Priya', 'Daniel', 'Grace', 'Mateo', 'Sofia', 'Hugo', 'Chloe', 'Kai', 'Zoe', 'Omar', 'Lily', 'Theo', 'Nora'];
  const last = ['Morgan', 'Chen', 'Wilson', 'Patel', 'Garcia', 'Kim', 'Anderson', 'Williams', 'Singh', 'Brown', 'Martinez', 'Lee', 'Taylor', 'Thomas', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter'];
  const countries = ['US', 'GB', 'CA', 'DE', 'AU', 'FR', 'IN', 'BR'];
  const statuses = ['active', 'active', 'active', 'active', 'active', 'active', 'active', 'active', 'trial', 'inactive'];
  const productNames = ['Studio Headphones', 'Mechanical Keyboard', 'Wireless Mouse', 'USB-C Hub', 'Desk Mat', 'Monitor Stand', 'Webcam Pro', 'Portable SSD', 'Laptop Sleeve', 'Smart Speaker', 'LED Desk Lamp', 'Notebook Set', 'Travel Charger', 'Ergonomic Chair', 'Ultrawide Monitor', 'Cable Kit'];
  const users: DataRow[] = Array.from({ length: 1200 }, (_, i) => {
    const name = `${first[i % first.length]} ${last[Math.floor(i / first.length) % last.length]}`;
    return { id: i + 1, name, email: `${name.toLowerCase().replace(' ', '.')}${i + 1}@example.com`, status: statuses[i % 10], country: countries[i % 8], created_at: `2025-${String(i % 12 + 1).padStart(2, '0')}-${String(i % 27 + 1).padStart(2, '0')}` };
  });
  const products: DataRow[] = Array.from({ length: 128 }, (_, i) => ({ id: i + 1, name: `${productNames[i % 16]}${i >= 16 ? ` ${Math.floor(i / 16) + 1}` : ''}`, category: ['Electronics', 'Accessories', 'Workspace', 'Storage'][i % 4], price: Number((19 + (i * 17.3) % 420).toFixed(2)), stock: (i * 37 + 24) % 350 }));
  const orders: DataRow[] = Array.from({ length: 4860 }, (_, i) => ({ id: i + 1, user_id: i % 1200 + 1, product_id: (i * 7) % 128 + 1, total: Number((24 + (i * 43.79) % 695).toFixed(2)), status: i % 19 === 0 ? 'refunded' : i % 11 === 0 ? 'pending' : 'completed', created_at: `2026-03-${String(i % 28 + 1).padStart(2, '0')}` }));
  const analytics: DataRow[] = Array.from({ length: 24500 }, (_, i) => ({ id: i + 1, user_id: (i * 13) % 1200 + 1, event_type: ['page_view', 'page_view', 'add_to_cart', 'purchase', 'sign_up'][i % 5], page: ['/', '/products', '/cart', '/checkout', '/account'][i % 5], duration_ms: (i * 137) % 90000, created_at: `2026-03-${String(i % 28 + 1).padStart(2, '0')}` }));
  dataset = { users, orders, products, analytics };
  return dataset;
}

export function getAliases(config: QueryConfig): Record<string, string> {
  return { [config.table]: config.alias, ...Object.fromEntries(config.joins.map(j => [j.table, j.alias])) };
}
export function availableTables(config: QueryConfig): TableName[] { return [config.table, ...config.joins.map(j => j.table)]; }
export function selectionExpression(selection: Selection, aliases: Record<string, string>): string {
  const field = selection.column === '*' ? '*' : `${aliases[selection.table] || selection.table}.${selection.column}`;
  return selection.aggregate ? `${selection.aggregate}(${field})` : field;
}
export function getOutputs(config: QueryConfig): QueryOutput[] {
  const aliases = getAliases(config);
  const outputs: QueryOutput[] = [];
  const used = new Set<string>();
  config.columns.forEach(selection => {
    const columns = selection.column === '*' ? SCHEMAS[selection.table].columns.map(c => c.name) : [selection.column];
    columns.forEach(column => {
      const expanded = { ...selection, column };
      const base = selection.alias || (selection.aggregate && column !== '*' ? `${selection.aggregate.toLowerCase()}_${column}` : column === '*' ? `${aliases[selection.table]}_id` : column);
      let key = base;
      let suffix = 2;
      while (used.has(key)) key = `${base}_${suffix++}`;
      used.add(key);
      const type = SCHEMAS[selection.table].columns.find(c => c.name === column)?.type;
      outputs.push({ key, label: selection.column === '*' ? `${aliases[selection.table]}.${column}` : selectionExpression(expanded, aliases), type: selection.aggregate || ['integer', 'decimal'].includes(type || '') ? 'number' : 'text', selection: expanded });
    });
  });
  return outputs;
}
function filterExpression(filter: Filter, aliases: Record<string, string>): string {
  const field = `${aliases[filter.table]}.${filter.column}`;
  if (filter.operator === 'IS NULL' || filter.operator === 'IS NOT NULL') return `${field} ${filter.operator}`;
  const type = SCHEMAS[filter.table].columns.find(c => c.name === filter.column)?.type;
  const numeric = type === 'integer' || type === 'decimal';
  const quote = (value: string) => numeric && value.trim() !== '' && Number.isFinite(Number(value)) ? value : `'${value.replace(/'/g, "''")}'`;
  const value = filter.operator === 'IN' ? `(${filter.value.split(',').map(v => quote(v.trim())).join(', ')})` : quote(filter.value);
  return `${field} ${filter.operator} ${value}`;
}
export function compileQuery(config: QueryConfig): string {
  const aliases = getAliases(config);
  const fields = config.columns.map(c => `  ${selectionExpression(c, aliases)}${c.alias && c.alias !== c.column ? ` AS ${c.alias}` : ''}`);
  const lines = ['SELECT', fields.join(',\n'), `FROM ${config.table} ${config.alias}`];
  config.joins.forEach(j => lines.push(`${j.type} JOIN ${j.table} ${j.alias}`, `  ON ${aliases[j.leftTable]}.${j.leftColumn} = ${j.alias}.${j.rightColumn}`));
  if (config.filters.length) lines.push(`WHERE ${config.filters.map(f => filterExpression(f, aliases)).join(`\n  ${config.filterLogic} `)}`);
  const grouped = config.columns.filter(c => !c.aggregate && c.column !== '*').map(c => selectionExpression(c, aliases));
  if (grouped.length && config.columns.some(c => c.aggregate)) lines.push(`GROUP BY ${grouped.join(', ')}`);
  if (config.order.field) lines.push(`ORDER BY ${config.order.field} ${config.order.direction}`);
  if (config.limit >= 0) lines.push(`LIMIT ${config.limit}`);
  return `${lines.join('\n')};`;
}
export function validateConfig(config: QueryConfig): string | null {
  if (!config.columns.length) return 'Select at least one column in the visual builder.';
  if (!Number.isInteger(config.limit) || config.limit < -1 || config.limit > 10000) return 'Choose a row limit between 0 and 10,000, or leave it blank for all rows.';
  for (const selection of config.columns) {
    if (!availableTables(config).includes(selection.table)) return 'A selected column refers to a table that is not in this query.';
    if (selection.column !== '*' && !SCHEMAS[selection.table].columns.some(c => c.name === selection.column)) return `Unknown column: ${selection.table}.${selection.column}.`;
    if (selection.aggregate && ['SUM', 'AVG'].includes(selection.aggregate)) {
      const type = SCHEMAS[selection.table].columns.find(c => c.name === selection.column)?.type;
      if (!['integer', 'decimal'].includes(type || '')) return `${selection.aggregate} needs a numeric column. Try total, price, or duration_ms.`;
    }
  }
  if (config.columns.some(c => c.column === '*') && config.columns.some(c => c.aggregate)) return 'Select explicit columns when combining aggregates with other fields.';
  if (config.columns.some(c => c.alias && !/^[A-Za-z_]\w*$/.test(c.alias))) return 'Column aliases must start with a letter or underscore and contain only letters, numbers, or underscores.';
  for (const filter of config.filters) {
    if (!availableTables(config).includes(filter.table)) return 'A filter refers to a table that is not in this query.';
    if (!SCHEMAS[filter.table].columns.some(c => c.name === filter.column)) return `Unknown filter column: ${filter.table}.${filter.column}.`;
    if (!['IS NULL', 'IS NOT NULL'].includes(filter.operator) && !filter.value.trim()) return `Enter a value for the ${filter.table}.${filter.column} filter.`;
    const type = SCHEMAS[filter.table].columns.find(c => c.name === filter.column)?.type;
    if (['integer', 'decimal'].includes(type || '') && !['IS NULL', 'IS NOT NULL'].includes(filter.operator)) {
      const values = filter.operator === 'IN' ? filter.value.split(',') : [filter.value];
      if (values.some(v => !v.trim() || !Number.isFinite(Number(v)))) return `${filter.table}.${filter.column} needs a numeric value.`;
    }
  }
  return null;
}

type ParseResult = { config: QueryConfig; error: null } | { config: null; error: string };
const parseError = (message: string): ParseResult => ({ config: null, error: message });
function splitComma(value: string): string[] {
  const parts: string[] = []; let depth = 0; let quote = false; let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") quote = !quote;
    if (!quote) {
      if (value[i] === '(') depth++;
      if (value[i] === ')') depth--;
      if (value[i] === ',' && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}
function splitFilterParts(value: string): string[] {
  const parts: string[] = []; let depth = 0; let quoted = false; let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "'") {
      if (quoted && value[i + 1] === "'") { i++; continue; }
      quoted = !quoted;
    }
    if (quoted) continue;
    if (value[i] === '(') depth++;
    if (value[i] === ')') depth--;
    if (depth === 0 && /\s/.test(value[i])) {
      const operator = value.slice(i).match(/^\s+(AND|OR)\s+/i);
      if (operator) { parts.push(value.slice(start, i).trim(), operator[1].toUpperCase()); i += operator[0].length - 1; start = i + 1; }
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}
export function parseQuery(sql: string): ParseResult {
  const text = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/;\s*$/, '');
  if (!text) return parseError('Write a SELECT query to get started.');
  if (text.includes(';')) return parseError('Run one SELECT statement at a time.');
  if (!/^SELECT\s/i.test(text)) return parseError('This read-only sandbox supports SELECT queries, not data modification.');
  const main = text.match(/^SELECT\s+([\s\S]+?)\s+FROM\s+(users|orders|products|analytics)(?:\s+(?:AS\s+)?(?!JOIN\b|WHERE\b|GROUP\b|ORDER\b|LIMIT\b|INNER\b|LEFT\b|RIGHT\b|FULL\b)([a-z_]\w*))?([\s\S]*)$/i);
  if (!main) return parseError('Use FROM users, orders, products, or analytics. The sandbox contains these four tables.');
  const config: QueryConfig = { table: main[2].toLowerCase() as TableName, alias: main[3] || main[2][0], columns: [], joins: [], filters: [], filterLogic: 'AND', order: { field: '', direction: 'ASC' }, limit: -1 };
  let rest = main[4];
  const limit = rest.match(/\s+LIMIT\s+(\d+)\s*$/i);
  if (limit) { config.limit = Number(limit[1]); rest = rest.slice(0, limit.index); }
  const order = rest.match(/\s+ORDER\s+BY\s+([\s\S]+)$/i);
  if (order) {
    const pieces = order[1].trim().split(/\s+/);
    if (pieces.length > 2) return parseError('The visual sandbox supports one ORDER BY expression.');
    config.order = { field: pieces[0], direction: (pieces[1]?.toUpperCase() || 'ASC') as 'ASC' | 'DESC' };
    if (!['ASC', 'DESC'].includes(config.order.direction)) return parseError('Sort direction must be ASC or DESC.');
    rest = rest.slice(0, order.index);
  }
  let group = '';
  const grouped = rest.match(/\s+GROUP\s+BY\s+([\s\S]+)$/i);
  if (grouped) { group = grouped[1]; rest = rest.slice(0, grouped.index); }
  const where = rest.match(/\s+WHERE\s+([\s\S]+)$/i);
  if (where) {
    const parts = splitFilterParts(where[1]);
    const logic = parts.length > 1 ? parts[1].toUpperCase() : 'AND';
    if (parts.some((p, i) => i % 2 === 1 && p.toUpperCase() !== logic)) return parseError('Use either AND or OR between filters in the visual sandbox.');
    config.filterLogic = logic as 'AND' | 'OR';
    const supported: FilterOperator[] = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IS NULL', 'IS NOT NULL', 'IN'];
    for (let i = 0; i < parts.length; i += 2) {
      const f = parts[i].trim().match(/^(\w+)\.(\w+)\s*(IS\s+NOT\s+NULL|IS\s+NULL|NOT\s+IN|IN|LIKE|NOT\s+LIKE|=|!=|<>|>=|<=|>|<)(?:\s*([\s\S]+))?$/i);
      if (!f) return parseError('Filters need a qualified column, an operator, and a value. For example: u.status = \'active\'.');
      const op = f[3].toUpperCase().replace(/\s+/g, ' ').replace('<>', '!=') as FilterOperator;
      if (!supported.includes(op)) return parseError('This sandbox supports =, !=, >, <, >=, <=, LIKE, IN, IS NULL, and IS NOT NULL.');
      let value = (f[4] || '').trim();
      if (op === 'IN') {
        if (!/^\([\s\S]*\)$/.test(value)) return parseError('IN values must be inside parentheses.');
        value = splitComma(value.slice(1, -1)).map(v => v.replace(/^'|'$/g, '').replace(/''/g, "'")).join(', ');
      } else if (value.startsWith("'")) {
        if (!/^'(?:''|[^'])*'$/.test(value)) return parseError('Close the string literal in your filter.');
        value = value.slice(1, -1).replace(/''/g, "'");
      } else if (!['IS NULL', 'IS NOT NULL'].includes(op) && !/^-?\d+(\.\d+)?$/.test(value)) return parseError('Filter values must be numbers or single-quoted strings.');
      config.filters.push({ id: uid(), table: f[1] as TableName, column: f[2], operator: op, value, rawTable: f[1] } as Filter & { rawTable: string });
    }
    rest = rest.slice(0, where.index);
  }
  while (rest.trim()) {
    const join = rest.match(/^\s*(INNER\s+|LEFT\s+(?:OUTER\s+)?|RIGHT\s+(?:OUTER\s+)?|FULL\s+(?:OUTER\s+)?)?JOIN\s+(users|orders|products|analytics)(?:\s+(?:AS\s+)?(?!ON\b)([a-z_]\w*))?\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)(?=\s|$)/i);
    if (!join) return parseError('Unsupported JOIN syntax. Use JOIN table alias ON a.column = b.column.');
    const table = join[2].toLowerCase() as TableName;
    const alias = join[3] || table[0];
    const known = [config.table, ...config.joins.map(j => j.table)];
    if (known.includes(table)) return parseError(`The visual builder supports each table once. Use a single reference to ${table}.`);
    if ([config.alias, ...config.joins.map(j => j.alias)].includes(alias)) return parseError(`The alias “${alias}” is already in use. Give ${table} a unique alias.`);
    const aliases: Record<string, string> = { [config.table]: config.alias, ...Object.fromEntries(config.joins.map(j => [j.table, j.alias])), [table]: alias };
    const resolve = (a: string) => Object.keys(aliases).find(t => aliases[t] === a || t === a) as TableName | undefined;
    const a = resolve(join[4]); const b = resolve(join[6]);
    if (!a || !b || (a !== table && b !== table)) return parseError('A JOIN must connect the new table to a table already in the query.');
    const leftTable = a === table ? b! : a;
    config.joins.push({ id: uid(), table, alias, type: (join[1]?.trim().split(/\s+/)[0].toUpperCase() || 'INNER') as JoinType, leftTable, leftColumn: a === table ? join[7] : join[5], rightColumn: a === table ? join[5] : join[7] });
    rest = rest.slice(join[0].length);
  }
  const aliases = getAliases(config);
  const resolve = (a: string) => Object.keys(aliases).find(t => aliases[t] === a || t === a) as TableName | undefined;
  const rawFilters = config.filters as (Filter & { rawTable: string })[];
  config.filters = [];
  for (const raw of rawFilters) {
    const table = resolve(raw.rawTable);
    if (!table) return parseError(`Unknown table alias “${raw.rawTable}” in the WHERE clause.`);
    if (!SCHEMAS[table].columns.some(c => c.name === raw.column)) return parseError(`Unknown filter column: ${table}.${raw.column}. Open Schema to see available columns.`);
    config.filters.push({ id: uid(), table, column: raw.column, operator: raw.operator, value: raw.value });
  }
  for (const field of splitComma(main[1])) {
    const aggregate = field.match(/^(COUNT|SUM|AVG|MIN|MAX)\(\s*(?:(\w+)\.)?(\*|\w+)\s*\)(?:\s+AS\s+(\w+))?$/i);
    const plain = field.match(/^(?:(\w+)\.)?(\*|\w+)(?:\s+AS\s+(\w+))?$/i);
    if (aggregate) {
      const table = aggregate[2] ? resolve(aggregate[2]) : config.table;
      if (!table) return parseError(`Unknown table alias in ${field}.`);
      config.columns.push({ id: uid(), table, column: aggregate[3], aggregate: aggregate[1].toUpperCase() as Aggregate, alias: aggregate[4] });
    } else if (plain) {
      const table = plain[1] ? resolve(plain[1]) : config.table;
      if (!table) return parseError(`Unknown table alias in ${field}.`);
      config.columns.push({ id: uid(), table, column: plain[2], alias: plain[3] });
    } else return parseError(`Unsupported expression: ${field}. Use columns, COUNT, SUM, AVG, MIN, or MAX.`);
  }
  for (const j of config.joins) {
    if (!SCHEMAS[j.table].columns.some(c => c.name === j.rightColumn) || !SCHEMAS[j.leftTable].columns.some(c => c.name === j.leftColumn)) return parseError('A JOIN refers to a column that does not exist. Open Schema to inspect the tables.');
  }
  if (config.order.field) {
    const field = config.order.field;
    const output = getOutputs(config).find(o => o.key.toLowerCase() === field.toLowerCase());
    if (output) config.order.field = output.key;
    else if (field.includes('.')) {
      const [a, column] = field.split('.'); const table = resolve(a);
      if (!table || !SCHEMAS[table].columns.some(c => c.name === column)) return parseError('The ORDER BY column does not exist.');
      config.order.field = `${aliases[table]}.${column}`;
    } else return parseError('Sort by a selected column alias or a qualified table column.');
  }
  if (group) {
    if (!config.columns.some(c => c.aggregate)) return parseError('Use an aggregate such as COUNT or SUM with GROUP BY in this sandbox.');
    const expected = config.columns.filter(c => !c.aggregate && c.column !== '*').map(c => selectionExpression(c, aliases).toLowerCase());
    const actual = splitComma(group).map(g => g.toLowerCase());
    if (expected.length !== actual.length || expected.some(e => !actual.includes(e))) return parseError('GROUP BY must include all non-aggregated selected columns.');
  }
  const error = validateConfig(config);
  return error ? parseError(error) : { config, error: null };
}

type CombinedRow = Record<string, DataRow | null>;
function matchesFilter(row: CombinedRow, filter: Filter, aliases: Record<string, string>): boolean {
  const value = row[aliases[filter.table]]?.[filter.column];
  if (filter.operator === 'IS NULL') return value == null;
  if (filter.operator === 'IS NOT NULL') return value != null;
  if (value == null) return false;
  const type = SCHEMAS[filter.table].columns.find(c => c.name === filter.column)?.type;
  const numeric = ['integer', 'decimal'].includes(type || '');
  const target = numeric ? Number(filter.value) : filter.value.toLowerCase();
  const actual = numeric ? Number(value) : String(value).toLowerCase();
  switch (filter.operator) {
    case '=': return actual === target;
    case '!=': return actual !== target;
    case '>': return actual > target;
    case '<': return actual < target;
    case '>=': return actual >= target;
    case '<=': return actual <= target;
    case 'IN': return filter.value.split(',').some(v => (numeric ? Number(v.trim()) : v.trim().toLowerCase()) === actual);
    case 'LIKE': {
      const escaped = filter.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
      return new RegExp(`^${escaped}$`, 'i').test(String(value));
    }
    default: return false;
  }
}
export function executeQuery(config: QueryConfig): { rows: DataRow[]; columns: QueryOutput[]; totalMatched: number; rowsScanned: number } {
  const error = validateConfig(config); if (error) throw new Error(error);
  const data = getDataset(); const aliases = getAliases(config);
  let combined: CombinedRow[] = data[config.table].map(row => ({ [config.alias]: row }));
  let rowsScanned = data[config.table].length;
  config.joins.forEach(join => {
    const right = data[join.table]; rowsScanned += right.length;
    const buckets = new Map<string, { row: DataRow; index: number }[]>();
    right.forEach((row, index) => {
      const key = String(row[join.rightColumn]);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push({ row, index });
    });
    const next: CombinedRow[] = []; const matched = new Set<number>();
    combined.forEach(row => {
      const matches = buckets.get(String(row[aliases[join.leftTable]]?.[join.leftColumn])) || [];
      if (matches.length) matches.forEach(match => { next.push({ ...row, [join.alias]: match.row }); matched.add(match.index); });
      else if (join.type === 'LEFT' || join.type === 'FULL') next.push({ ...row, [join.alias]: null });
    });
    if (join.type === 'RIGHT' || join.type === 'FULL') right.forEach((row, index) => {
      if (!matched.has(index)) {
        const empty = Object.fromEntries(Object.keys(aliases).filter(table => table !== join.table).map(table => [aliases[table], null]));
        next.push({ ...empty, [join.alias]: row });
      }
    });
    combined = next;
  });
  combined = combined.filter(row => {
    if (!config.filters.length) return true;
    const checks = config.filters.map(f => matchesFilter(row, f, aliases));
    return config.filterLogic === 'AND' ? checks.every(Boolean) : checks.some(Boolean);
  });
  const outputs = getOutputs(config);
  let rows: DataRow[];
  if (config.columns.some(c => c.aggregate)) {
    const groups = new Map<string, CombinedRow[]>(); const plain = config.columns.filter(c => !c.aggregate && c.column !== '*');
    combined.forEach(row => {
      const key = JSON.stringify(plain.map(c => row[aliases[c.table]]?.[c.column] ?? null));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    });
    if (!groups.size && !plain.length) groups.set('[]', []);
    rows = Array.from(groups.values()).map(group => {
      const row: DataRow = {};
      outputs.forEach(output => {
        const selection = output.selection!;
        const values = group.map(r => r[aliases[selection.table]]?.[selection.column] ?? null);
        if (!selection.aggregate) { row[output.key] = values[0] ?? null; return; }
        const nonNull = values.filter(v => v != null);
        if (selection.aggregate === 'COUNT') row[output.key] = selection.column === '*' ? group.length : nonNull.length;
        else if (!nonNull.length) row[output.key] = null;
        else if (selection.aggregate === 'SUM' || selection.aggregate === 'AVG') {
          const sum = nonNull.reduce<number>((sum, v) => sum + Number(v), 0);
          row[output.key] = Number((selection.aggregate === 'AVG' ? sum / nonNull.length : sum).toFixed(2));
        } else row[output.key] = selection.aggregate === 'MIN' ? nonNull.reduce((a, b) => a < b ? a : b) : nonNull.reduce((a, b) => a > b ? a : b);
      });
      return row;
    });
  } else rows = combined.map(row => Object.fromEntries(outputs.map(output => [output.key, row[aliases[output.selection!.table]]?.[output.selection!.column] ?? null])));
  const totalMatched = rows.length;
  if (config.order.field) {
    let key = config.order.field;
    const qualified = config.order.field.includes('.') ? config.order.field.split('.') : null;
    const selectedOutput = outputs.find(output => output.key === key || (qualified && output.selection && !output.selection.aggregate && aliases[output.selection.table] === qualified[0] && output.selection.column === qualified[1]));
    if (selectedOutput) key = selectedOutput.key;
    else if (qualified) {
      const sourceTable = Object.keys(aliases).find(table => aliases[table] === qualified[0]);
      if (sourceTable && !config.columns.some(c => c.aggregate)) {
        rows.forEach((row, index) => Object.defineProperty(row, '__qp_sort', { value: combined[index][qualified[0]]?.[qualified[1]] ?? null, enumerable: false }));
        key = '__qp_sort';
      }
    }
    rows.sort((a, b) => {
      const av = a[key]; const bv = b[key];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return config.order.direction === 'DESC' ? -result : result;
    });
  }
  if (config.limit >= 0) rows = rows.slice(0, config.limit);
  return { rows, columns: outputs, totalMatched, rowsScanned };
}
export function inferJoin(table: TableName, existing: TableName[]): Omit<Join, 'id' | 'alias' | 'type'> {
  if (table === 'orders' && existing.includes('users')) return { table, leftTable: 'users', leftColumn: 'id', rightColumn: 'user_id' };
  if (table === 'analytics' && existing.includes('users')) return { table, leftTable: 'users', leftColumn: 'id', rightColumn: 'user_id' };
  if (table === 'products' && existing.includes('orders')) return { table, leftTable: 'orders', leftColumn: 'product_id', rightColumn: 'id' };
  if (table === 'orders' && existing.includes('products')) return { table, leftTable: 'products', leftColumn: 'id', rightColumn: 'product_id' };
  if (table === 'users') {
    const parent = existing.find(t => t === 'orders' || t === 'analytics');
    if (parent) return { table, leftTable: parent, leftColumn: 'user_id', rightColumn: 'id' };
  }
  return { table, leftTable: existing[0], leftColumn: SCHEMAS[existing[0]].columns[0].name, rightColumn: SCHEMAS[table].columns[0].name };
}
export function toCsv(columns: QueryOutput[], rows: DataRow[]): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [columns.map(c => escape(c.key)).join(','), ...rows.map(row => columns.map(c => escape(row[c.key])).join(','))].join('\r\n');
}
