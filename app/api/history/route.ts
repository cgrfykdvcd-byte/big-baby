import { requireUser } from '@/lib/auth';
import { database } from '@/lib/storage';
import { failure, reply } from '@/lib/security';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const user=await requireUser(request),id=new URL(request.url).searchParams.get('id');const rows=await database().prepare('SELECT before_json AS beforeJson,after_json AS afterJson,created_at AS createdAt FROM entry_versions WHERE user_id=? AND entry_id=? ORDER BY created_at DESC LIMIT 30').bind(user.userId,id).all();return reply({versions:rows.results})}catch(e){return failure(e)}}
