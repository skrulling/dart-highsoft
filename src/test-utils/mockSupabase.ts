/**
 * Reusable Supabase mock utilities for testing
 *
 * Provides a fluent API mock for Supabase client that supports:
 * - select().eq().order() chains
 * - insert/update/delete operations
 * - Query logging for assertions
 * - Configurable mock data per test
 */

import { vi } from 'vitest';

// Type definitions
export type MatchRow = {
  id: string;
  mode: 'x01';
  start_score: '201' | '301' | '501';
  finish: 'single_out' | 'double_out';
  legs_to_win: number;
  fair_ending?: boolean;
};

export type PlayerRow = { id: string; display_name: string };

export type MatchPlayerRow = {
  match_id: string;
  player_id: string;
  play_order: number;
  players: PlayerRow;
};

export type LegRow = {
  id: string;
  match_id: string;
  leg_number: number;
  starting_player_id: string;
  winner_player_id: string | null;
};

export type TurnRow = {
  id: string;
  leg_id: string;
  player_id: string;
  turn_number: number;
  total_scored: number | null;
  busted: boolean;
  tiebreak_round: number | null;
};

export type ThrowRow = {
  id: string;
  turn_id: string;
  dart_index: number;
  segment: string;
  scored: number;
  match_id: string;
};

export type MockDb = {
  matches: MatchRow[];
  match_players: MatchPlayerRow[];
  legs: LegRow[];
  turns: TurnRow[];
  throws: ThrowRow[];
};

export type SupabaseResponse<T = unknown> = { data: T; error: null } | { data: null; error: { message: string } };

type TableRow = Record<string, unknown>;
type FilterFn = (row: TableRow) => boolean;
type OrderState = { column: string; ascending: boolean };

export type QueryLogEntry = {
  table: keyof MockDb;
  operation: 'select' | 'insert' | 'update' | 'delete';
  detail?: string;
};

type MockBuilder = {
  select: (query: string) => MockBuilder;
  eq: (column: string, value: unknown) => MockBuilder;
  in: (column: string, values: unknown[]) => MockBuilder;
  order: (column: string, options?: { ascending?: boolean }) => MockBuilder;
  limit: (count: number) => MockBuilder;
  single: () => Promise<SupabaseResponse>;
  maybeSingle: () => Promise<SupabaseResponse>;
  then: <TResult1 = SupabaseResponse, TResult2 = never>(
    onFulfilled?: ((value: SupabaseResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
  catch: <TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ) => Promise<SupabaseResponse | TResult>;
  finally: (onFinally?: (() => void) | null) => Promise<SupabaseResponse>;
  insert: (payload: unknown | unknown[]) => MockBuilder;
  update: (values: Record<string, unknown>) => MockBuilder;
  delete: () => MockBuilder;
};

// Query logging
const queryLog: QueryLogEntry[] = [];

export const recordQuery = (table: keyof MockDb, operation: QueryLogEntry['operation'], detail?: string) => {
  queryLog.push({ table, operation, detail });
};

export const resetQueryLog = () => {
  queryLog.length = 0;
};

export const getQueryLog = () => [...queryLog];

// Helper to deep clone objects
const clone = <T>(value: T): T => structuredClone(value);

// Create query builder for a table
export const createQueryBuilder = (mockDb: MockDb, table: keyof MockDb): MockBuilder => {
  const filters: FilterFn[] = [];
  let order: OrderState | null = null;
  let limitCount: number | null = null;
  let selectQuery = '';

  const buildRows = () => {
    const dataset = ((mockDb[table] ?? []) as TableRow[]).map((row) => clone(row));
    let rows = dataset.filter((row) => filters.every((fn) => fn(row)));
    if (table === 'turns' && selectQuery.includes('throws')) {
      rows = rows.map((row) => ({
        ...row,
        throws: mockDb.throws.filter((thr) => thr.turn_id === row.id).map((thr) => clone(thr)),
      }));
    }
    if (table === 'match_players' && selectQuery.includes('players')) {
      rows = rows.map((row) => ({
        ...row,
        players: clone(row.players),
      }));
    }
    if (order) {
      rows.sort((a, b) => {
        const aVal = a[order!.column] as string | number;
        const bVal = b[order!.column] as string | number;
        if (aVal < bVal) return order!.ascending ? -1 : 1;
        if (aVal > bVal) return order!.ascending ? 1 : -1;
        return 0;
      });
    }
    if (typeof limitCount === 'number') {
      rows = rows.slice(0, limitCount);
    }
    return rows;
  };

  const buildResponse = (): SupabaseResponse => ({ data: buildRows(), error: null });
  const buildSingleResponse = () => {
    const rows = buildRows();
    return { data: rows[0] ?? null, error: null } as SupabaseResponse;
  };

  const builder: MockBuilder = {
    select(query: string) {
      selectQuery = query ?? '';
      recordQuery(table, 'select', selectQuery);
      return this;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return this;
    },
    in(column: string, values: unknown[]) {
      filters.push((row) => values.includes(row[column]));
      return this;
    },
    order(column: string, options?: { ascending?: boolean }) {
      order = { column, ascending: options?.ascending !== false };
      return this;
    },
    limit(count: number) {
      limitCount = count;
      return this;
    },
    single() {
      return Promise.resolve(buildSingleResponse());
    },
    maybeSingle() {
      return Promise.resolve(buildSingleResponse());
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(buildResponse()).then(onFulfilled, onRejected);
    },
    catch(onRejected) {
      return Promise.resolve(buildResponse()).catch(onRejected);
    },
    finally(onFinally) {
      return Promise.resolve(buildResponse()).finally(onFinally ?? undefined);
    },
    insert(payload: unknown | unknown[]) {
      recordQuery(table, 'insert');
      const rows = Array.isArray(payload) ? payload : [payload];
      const insertedRecords = rows.map((row) => {
        const record: TableRow = {
          id: (row as TableRow).id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...row,
        };
        (mockDb[table] as TableRow[]).push(record);
        return clone(record);
      });

      const response: SupabaseResponse = { data: insertedRecords, error: null };

      const insertBuilder: MockBuilder = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return this;
        },
        single() {
          return Promise.resolve({ data: insertedRecords[0] ?? null, error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: insertedRecords[0] ?? null, error: null });
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve(response).then(onFulfilled, onRejected);
        },
        catch(onRejected) {
          return Promise.resolve(response).catch(onRejected);
        },
        finally(onFinally) {
          return Promise.resolve(response).finally(onFinally ?? undefined);
        },
        insert() {
          return this;
        },
        update() {
          return this;
        },
        delete() {
          return this;
        },
      };

      return insertBuilder;
    },
    update(values: Record<string, unknown>) {
      recordQuery(table, 'update');
      const valuesToUpdate = values;
      const updateBuilder = { ...builder };
      updateBuilder.then = (onFulfilled, onRejected) => {
        const dataset = mockDb[table] as TableRow[];
        const updated = dataset.filter((row) => filters.every((fn) => fn(row)));
        updated.forEach((row) => Object.assign(row, valuesToUpdate));
        return Promise.resolve({ data: updated.map((row) => ({ ...row })), error: null }).then(
          onFulfilled,
          onRejected
        );
      };
      return updateBuilder;
    },
    delete() {
      recordQuery(table, 'delete');
      const deleteBuilder = { ...builder };
      deleteBuilder.then = (onFulfilled, onRejected) => {
        const dataset = mockDb[table] as TableRow[];
        const keep: TableRow[] = [];
        const removed: TableRow[] = [];
        dataset.forEach((row) => {
          if (filters.every((fn) => fn(row))) {
            removed.push(row);
          } else {
            keep.push(row);
          }
        });
        dataset.length = 0;
        dataset.push(...keep);
        return Promise.resolve({ data: removed.map((row) => clone(row)), error: null } as SupabaseResponse).then(
          onFulfilled,
          onRejected
        );
      };
      deleteBuilder.catch = (onRejected) => {
        return (deleteBuilder.then as unknown as MockBuilder['then'])(null, onRejected) as unknown as Promise<
          SupabaseResponse
        >;
      };
      deleteBuilder.finally = (onFinally) => {
        return (deleteBuilder.then as unknown as MockBuilder['then'])(null, null).finally(onFinally ?? undefined) as unknown as Promise<
          SupabaseResponse
        >;
      };
      return deleteBuilder;
    },
  };

  return builder;
};

/**
 * Creates a mock Supabase client backed by the provided mock database
 */
export const createMockSupabaseClient = (mockDb: MockDb) => ({
  from(table: keyof MockDb) {
    return createQueryBuilder(mockDb, table);
  },
});

/**
 * Creates and manages a mock database instance
 */
export const createMockDbManager = (initialDb: MockDb) => {
  let mockDb: MockDb = clone(initialDb);

  return {
    get db() {
      return mockDb;
    },
    reset() {
      mockDb = clone(initialDb);
      resetQueryLog();
    },
    setMatchFinish(rule: MatchRow['finish']) {
      mockDb.matches[0] = { ...mockDb.matches[0], finish: rule };
    },
    addTurn(turn: TurnRow) {
      mockDb.turns.push(turn);
    },
    addThrow(t: ThrowRow) {
      mockDb.throws.push(t);
    },
    updateTurn(turnId: string, updates: Partial<TurnRow>) {
      const turn = mockDb.turns.find((t) => t.id === turnId);
      if (turn) Object.assign(turn, updates);
    },
    getClient() {
      return createMockSupabaseClient(mockDb);
    },
  };
};

/**
 * Standard mock for Next.js navigation
 */
export const createMockRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
});

/**
 * Standard mock for realtime connection
 */
export const createMockRealtime = () => ({
  connectionStatus: 'connected' as const,
  isConnected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  updatePresence: vi.fn(),
});
