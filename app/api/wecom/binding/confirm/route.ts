import { requireUser } from "@/lib/auth";
import { assertWrite, failure, limitedJson, reply } from "@/lib/security";
import { bindingChallengeStatus } from "@/lib/wecom-identity";

export const dynamic="force-dynamic";
// Confirmation is completed by a verified WeCom callback. This endpoint only
// lets the logged-in owner poll their own challenge; it never accepts a UserID.
export async function POST(request:Request){try{assertWrite(request);const user=await requireUser(request),body=await limitedJson(request,8_000) as {challenge_id?:unknown};if(typeof body.challenge_id!=="string")throw new Error("invalid_challenge");return reply({binding:await bindingChallengeStatus(user.userId,body.challenge_id)});}catch(error){return failure(error)}}
