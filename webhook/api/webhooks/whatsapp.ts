import type { VercelRequest,VercelResponse } from "@vercel/node";
import { sql } from "../../lib/db.js";
import { validMetaSignature } from "../../lib/security.js";

export const config={api:{bodyParser:false}};
async function rawBody(request:VercelRequest){const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks)}
export default async function handler(request:VercelRequest,response:VercelResponse){
  if(request.method==="GET"){const mode=request.query["hub.mode"],token=request.query["hub.verify_token"],challenge=request.query["hub.challenge"];return mode==="subscribe"&&token===process.env.META_VERIFY_TOKEN?response.status(200).send(challenge):response.status(403).send("Verification failed");}
  if(request.method!=="POST")return response.status(405).end(); const raw=await rawBody(request); if(!validMetaSignature(raw,request.headers["x-hub-signature-256"] as string|undefined))return response.status(401).send("Invalid signature");
  const event=JSON.parse(raw.toString("utf8"));const messages=event.entry?.flatMap((entry:any)=>entry.changes??[]).flatMap((change:any)=>change.value?.messages??[])??[];const database=sql();
  for(const message of messages){if(message.type!=="text")continue;await database`INSERT INTO whatsapp_inbox(id,sender,message,received_at,raw_event) VALUES(${message.id},${message.from},${message.text.body},to_timestamp(${Number(message.timestamp)}),${JSON.stringify(message)}::jsonb) ON CONFLICT(id) DO NOTHING`;}
  return response.status(200).json({received:true});
}
