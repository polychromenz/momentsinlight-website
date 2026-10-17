// Cloudflare's AI models for the studio's suggestions, with fallbacks: Cloudflare retires models
// from time to time (llama-3.1-8b went on 2026-05-30), so each call tries the next model on the
// list if one is gone or fails.
const TEXT = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/mistralai/mistral-small-3.1-24b-instruct'];
const VISION = ['@cf/llava-hf/llava-1.5-7b-hf', '@cf/meta/llama-3.2-11b-vision-instruct'];

/** A chat reply: messages = [{ role, content }]. */
export async function chat(env, messages, maxTokens = 200) {
  if (!env.AI) throw new Error('Suggestions aren’t switched on yet.');
  let last;
  for (const model of TEXT) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: maxTokens });
      const text = String(out?.response ?? out?.result?.response ?? out?.choices?.[0]?.message?.content ?? '').trim();
      if (text) return text;
    } catch (e) { last = e; console.error('ai: chat', model, e.message); }
  }
  throw new Error(`No suggestion came back${last ? ` (${last.message})` : ''}. Try again.`);
}

/** A short description of a photo (bytes = the image as an array of numbers). */
export async function see(env, bytes, prompt, maxTokens = 60) {
  if (!env.AI) throw new Error('Photo suggestions aren’t switched on yet.');
  let last;
  for (const model of VISION) {
    try {
      let out;
      try { out = await env.AI.run(model, { image: bytes, prompt, max_tokens: maxTokens }); } catch (e) {
        // Meta's vision model asks for its licence to be accepted once.
        if (!/agree/i.test(e.message)) throw e;
        await env.AI.run(model, { prompt: 'agree' });
        out = await env.AI.run(model, { image: bytes, prompt, max_tokens: maxTokens });
      }
      const text = String(out?.description ?? out?.response ?? '').trim();
      if (text) return text;
    } catch (e) { last = e; console.error('ai: see', model, e.message); }
  }
  throw new Error(`No suggestion came back${last ? ` (${last.message})` : ''}. Try again.`);
}
