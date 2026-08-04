// Re-export everything from supabase-db so both import paths work during the
// Prisma → Supabase transition.
//
//   import { supabase, paginatedQuery } from '@/lib/supabase-db'
//   import { supabase, paginatedQuery } from '@/lib/db-supabase'   // also works

export {
  supabase,
  paginatedQuery,
  paginatedQuery as paginate,
  countRows,
  runSequential,
  searchFilter,
} from '@/lib/supabase-db'

export type {
  PaginatedQueryOptions,
  PaginatedResult,
} from '@/lib/supabase-db'
