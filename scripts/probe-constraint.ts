// Probe 2: constraint check using the APP's wrapped supabase client (auto id)
import { supabase } from '../src/lib/supabase-db'

async function main() {
  const jobId = '1f28f80a-1f8b-490b-b509-636909edf42e'
  const dup = await supabase
    .from('StageTracking')
    .insert({ productionJobId: jobId, stageName: 'Cutting', sequence: 1, locationType: 'In-House', status: 'Pending', createdAt: new Date().toISOString() })
    .select('id')
  if (dup.error) {
    console.log('dup insert ERROR:', dup.error.code, dup.error.message)
  } else {
    const id = (dup.data as any)[0].id
    console.log('dup insert OK — unique constraint DROPPED (row', id, ')')
    await supabase.from('StageTracking').delete().eq('id', id)
    const { count } = await supabase.from('StageTracking').select('id', { count: 'exact', head: true })
    console.log('cleanup done, StageTracking count =', count)
  }
}

main()
