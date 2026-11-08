import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, User } from 'lucide-react';
import type { ChatMessage, Receipt, Settings } from '../types';
import { answerLocally, askLLM, newMessage } from '../lib/assistant';

const SUGGESTIONS = [
  'How much did I spend this month?',
  'What is my spending by category?',
  'Show my top merchants',
  'How much did I spend on groceries?',
  'What are my most expensive items?',
  'List my receipts this week',
  'What is my average receipt?',
];

export function Assistant({
  receipts,
  settings,
}: {
  receipts: Receipt[];
  settings: Settings;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    newMessage(
      'assistant',
      "Hi! I'm your spending assistant. Ask me about your receipts — totals, items, merchants, or dates. Everything is answered on your device; add an LLM endpoint in Settings for open-ended questions.",
    ),
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    const userMsg = newMessage('user', question);
    setMessages((m) => [...m, userMsg]);
    setBusy(true);

    try {
      const local = answerLocally(question, receipts, settings.currency);
      if (local) {
        setMessages((m) => [...m, newMessage('assistant', local.content, { table: local.table, sources: ['local'] })]);
      } else if (settings.llmBaseUrl) {
        const res = await askLLM(question, receipts, settings, messages);
        setMessages((m) => [...m, newMessage('assistant', res.content, { sources: ['llm'] })]);
      } else {
        setMessages((m) => [
          ...m,
          newMessage(
            'assistant',
            "I couldn't answer that from your data with my built-in rules. Try asking about totals, a category, a merchant, a specific item, or a date range (\"this month\", \"in March\"). For open-ended questions, add an LLM endpoint under Settings.",
          ),
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        newMessage('assistant', `Sorry — I hit an error: ${e instanceof Error ? e.message : String(e)}`),
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-card card">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m) => (
          <div className={`msg ${m.role}`} key={m.id}>
            <div className="msg-avatar">
              {m.role === 'assistant' ? <Bot size={16} /> : <User size={16} />}
            </div>
            <div className="msg-bubble">
              {m.content}
              {m.table && (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {m.table.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {m.table.rows.map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} className={typeof cell === 'string' && /^\$|^€|^£|^₹|^¥/.test(cell) ? 'num' : undefined}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="msg-avatar">
              <Bot size={16} />
            </div>
            <div className="msg-bubble">
              <Loader2 size={16} className="spin" />
            </div>
          </div>
        )}
      </div>

      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <button className="suggestion" key={s} onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <textarea
          className="input"
          placeholder="Ask about your spending…"
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <button className="btn btn-primary" onClick={() => void send(input)} disabled={busy || !input.trim()}>
          {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
        </button>
      </div>
      {!settings.llmBaseUrl && (
        <div className="tiny muted" style={{ padding: '0 18px 14px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <Sparkles size={13} /> Offline assistant active — add an LLM endpoint in Settings for free-form Q&amp;A.
        </div>
      )}
    </div>
  );
}
