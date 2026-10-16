// Every studio request must come from Tony, signed in through Cloudflare Access.
import { signedIn, json } from '../../../functions-lib/studio.js';

export async function onRequest(context) {
  try {
    if (!(await signedIn(context.request, context.env))) return json({ error: 'Please sign in to the studio again.' }, 401);
  } catch {
    return json({ error: 'Could not check your sign-in. Please reload the page.' }, 401);
  }
  return context.next();
}
