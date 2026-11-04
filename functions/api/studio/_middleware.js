// Every studio request must come from someone signed in through Cloudflare Access; then the access
// rules in functions-lib/studio-gate.js apply (the studio phone app goes through the same gate,
// from functions/api/app/[[path]].js).
import { signedIn, json } from '../../../functions-lib/studio.js';
import { gate } from '../../../functions-lib/studio-gate.js';

export async function onRequest(context) {
  const { request, env } = context;
  let who;
  try {
    who = await signedIn(request, env);
    if (!who) return json({ error: 'Please sign in to the studio again.' }, 401);
  } catch {
    return json({ error: 'Could not check your sign-in. Please reload the page.' }, 401);
  }
  return gate(context, who, () => context.next());
}
