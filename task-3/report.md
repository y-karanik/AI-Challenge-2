# Development report

## Tools and techniques used

- **n8n cloud** as the orchestrator. Picked over a self-hosted Docker setup because the local Telegram webhook requires HTTPS, and the built-in tunnel mode in newer n8n versions did not work for me. n8n cloud gives free HTTPS out of the box and survives my laptop being off.
- **Jina Reader** (`https://r.jina.ai/<url>`) instead of writing an HTML parser. Returns clean markdown, which is ideal input for an LLM.
- **OpenAI `gpt-5.4-mini`** with `response_format: { type: "json_object" }`. Cheap and stable.
- **Supabase** for storage with three tables: `materials`, `questions`, `user_state`. Quiz progress is tracked entirely in `user_state` (current question index, correct count, full answer log).
- **Telegram inline keyboards** for both topic selection and answer choices. The same Telegram Trigger handles both `message` and `callback_query` updates, routed by a top-level Switch.

## What worked

- Splitting the work into two distinct AI agents (Teacher / Examiner) with strict JSON prompts. Both consistently returned valid JSON during development.
- Passing the full article content (truncated to ~8k chars) into the Teacher and only the title+summary+first chunk into the Examiner. Examiner questions stayed specific to the material, with no leakage across topics.
- Using `Prefer: resolution=merge-duplicates` style "upsert" via direct HTTP to the Supabase REST API for user_state turned out to be flaky. Replaced it with the cleaner pattern: `Delete by chat_id` then `Create` via the native Supabase node. Always-fresh state on a new quiz.
- Storing every answer (with the user's pick, the correct one, and the explanation) in `user_state.answers` as a JSON array allowed the final summary to include a per-question breakdown without a separate `attempts` table.

## What didn't work

- The native n8n OpenAI node failed with `config.headers.setContentType is not a function` regardless of refresh / re-credential. Bypassed it by calling `https://api.openai.com/v1/chat/completions` directly via HTTP Request — more reliable, gives full control over `response_format`.
- Local n8n via Docker required a tunnel for Telegram webhooks; the `--tunnel` flag and `N8N_TUNNEL=true` env var did not produce a public URL in the version I ran. Migrated to n8n cloud instead.
- The Supabase native node's Delete operation choked on filter expressions when the Condition operator was confused with the Field Value. Once I separated the operator (Equals) from the value, it worked.
- Telegram `MarkdownV2` parse mode was too strict — it requires escaping characters like `(`, `)`, `.`, `-` even inside plain text. Switched to the legacy `Markdown` mode, which is forgiving enough for our summaries.
- Sending an `Inline Keyboard` via the native Telegram "Send Message" node didn't accept a dynamic JSON `reply_markup` from an expression. Worked around it by calling Telegram's `sendMessage` REST endpoint directly via HTTP Request and serializing `reply_markup` with `JSON.stringify`.

## Notable design decisions

- **One Telegram Trigger for everything.** Telegram API allows only one webhook per bot, so a single trigger receives both messages and callback queries. The first Switch routes by `message.text` for `/start`, `/learn`, `/quiz`, and by `callback_query` existence for button clicks.
- **Two-level routing.** Callback queries go through a second Switch that distinguishes `pick:<materialId>` (start a new quiz) from `answer:<questionId>:<letter>` (record an answer).
- **State in DB, not in memory.** The bot is fully stateless between callbacks. Every answer reads `user_state` for the current question index and correct count, then writes back. This makes the bot robust to n8n restarts or webhook redelivery.
- **Answers stored as JSONB rather than a separate `attempts` table.** Simpler, fewer queries, and the breakdown needs them only as one bundle at the end of the quiz.
- **No "intelligent" answer validation.** For MCQ with inline keyboards there is nothing to fuzz-match — the user can only send a letter (A/B/C/D) via the buttons. Validation is an exact string compare. The explanation field, generated up front by the Examiner, is what makes the feedback intelligent.
- **Per-question feedback both during and after the quiz.** During: immediately after each click (correct / wrong + explanation). After: a full breakdown in the final message, including user's answer, the correct answer for wrong ones, and the explanation.

## What I would do next

- Switch from REST-over-HTTP to the native Supabase node everywhere once the filter/operator quirks settle. Less inline secret handling.
- Add a "stop quiz" command and a "retry" inline button on the final message.
- Add per-material attempt history so the user sees their improvement over time.