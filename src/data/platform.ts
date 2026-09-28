import { useQuery } from '@tanstack/react-query';
import type { Catalog, Kind, Resource } from '@/contracts/platform';
export async function api<T>(url: string, input?: unknown, signal?: AbortSignal): Promise<T> {
  const res=await fetch(url,{method:input===undefined?'GET':'POST',headers:input===undefined?{}:{'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input),signal});
  const data: unknown=await res.json();
  if(!res.ok) throw new Error(typeof data==='object'&&data!==null&&'error' in data?String(data.error):`HTTP ${res.status}`);
  return data as T;
}
export const useCatalog=()=>useQuery({queryKey:['catalog'],queryFn:({signal})=>api<Catalog>('/api/platform',undefined,signal)});
export const useResource=<K extends Kind>(kind:K,id:string,version?:number)=>useQuery({queryKey:['resource',kind,id,version],queryFn:({signal})=>api<Resource<K>>(`/api/platform/${kind}/${id}${version?`?version=${version}`:''}`,undefined,signal),enabled:Boolean(id)});
export type RunSummary={id:string;status:string;engine:string;verdict:string|null;createdAt:string;taskId:string|null;parkVersion:number|null;error?:unknown;metrics?:Record<string,number>};
export const useRuns=(parkId:string)=>useQuery({queryKey:['runs',parkId],queryFn:({signal})=>api<RunSummary[]>(`/api/platform/parks/${parkId}/runs`,undefined,signal),refetchInterval:1500});
