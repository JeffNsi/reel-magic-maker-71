import { startDirector } from "@/lib/director.functions";
const r: any = await (startDirector as any)({ data: { idea: "A woman walks through a train station and meets her younger self.", style: "cinematic", session_id: "aaaaaaaa-0000-4000-8000-000000000901" } });
console.log(JSON.stringify({ id: r.id, q: r.question, status: r.status }, null, 2));
