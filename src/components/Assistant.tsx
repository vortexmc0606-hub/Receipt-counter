import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Brain, Loader2, Send, Sparkles, Trash2, User } from 'lucide-react';
import type { ChatMessage, MemoryFact, Receipt, Settings } from '../types';
import { answerLocally, askLLM, newMessage } from '../lib/assistant';
import { answerMemoryCommand, parseMemoryCommand } from '../lib/memory';
import { askBackend, hasBackend } from '../lib/api';
import { BRAND } from '../lib/brand';

const SUGGESTIONS = [
  'How much did I spend this month?',
  'What is my spending by category?',
  'Show my top merchants',
  'How much did I spend on groceries?',
  'What are my most expensive items?',
  'List my receipts this week',
  'What is my average receipt?',
];

const MEMORY_SUGGESTIONS = ['What do you remember?', 'Remember that I want to cut back on coffee'];

export function Assistant({
  receipts,
  settings,
  memory,
  onMemoryChange,
}: {
  receipts: Receipt[];
  settings: Settings;
  memory: MemoryFact[];
  onMemoryChange: (facts: MemoryFact[]) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    newMessage(
      'assistant',
      `Hi! I'm ${BRAND.assistant}, your receipt assistant. Ask me to find anything in your receipts — items, prices, merchants, totals or dates. Tell me to \u201cremember\u2026\u201d and I'll keep it in mind for next time. Everything is answered on your device; add an LLM endpoint in Settings for open-ended questions.`,
    ),
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const push = (m: ChatMessage) => setMessages((prev) => [...prev, m]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput('');
    push(newMessage('user', question));
    setBusy(true);

    try {
      // Memory commands are handled deterministically, before any model call.
      const command = parseMemoryCommand(question);
      if (command) {
        const res = answerMemoryCommand(command, memory);
        if (res) {
          if (res.facts !== memory) onMemoryChange(res.facts);
          push(newMessage('assistant', res.answer.content, { table: res.answer.table, sources: ['memory'] }));
          return;
        }
      }

      const local = answerLocally(question, receipts, settings.currency);
      if (local) {
        push(newMessage('assistant', local.content, { table: local.table, sources: ['local'] }));
      } else if (hasBackend(settings)) {
        const content = await askBackend(question, receipts, settings, messages, memory);
        push(newMessage('assistant', content, { sources: ['server'] }));
      } else if (settings.llmBaseUrl) {
        const res = await askLLM(question, receipts, settings, messages, memory);
        push(newMessage('assistant', res.content, { sources: ['llm'] }));
      } else {
        push(
          newMessage(
            'assistant',
            "I couldn't answer that from your data with my built-in rules. Try asking about totals, a category, a merchant, a specific item, or a date range (\"this month\", \"in March\"). For open-ended questions, add an LLM endpoint under Settings.",
          ),
        );
      }
    } catch (e) {
      push(newMessage('assistant', `Sorry — I hit an error: ${e instanceof Error ? e.message : String(e)}`));
    } finally {
      setBusy(false);
    }
  };

  const clearMemory = () => {
    if (memory.length === 0) return;
    onMemoryChange([]);
    push(newMessage('assistant', `Done — I cleared all ${memory.length} remembered fact(s).`, { sources: ['memory'] }));
  };

  const suggestions = useMemo(
    () => (memory.length ? SUGGESTIONS : [...SUGGESTIONS.slice(0, 5), ...MEMORY_SUGGESTIONS]),
    [memory.length],
  );

  return (
    <div className="chat-card card animate-rise">
      <div className="chat-toolbar">
        <button
          className={`btn btn-ghost memory-toggle${showMemory ? ' is-open' : ''}`}
          onClick={() => setShowMemory((v) => !v)}
          aria-expanded={showMemory}
        >
          <Brain size={15} />
          Memory
          {memory.length > 0 && <span className="memory-count">{memory.length}</span>}
        </button>
        {showMemory && memory.length > 0 && (
          <button className="btn btn-ghost tiny-btn" onClick={clearMemory}>
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>

      {showMemory && (
        <div className="memory-panel animate-slide-down">
          {memory.length === 0 ? (
            <p className="tiny muted">
              Nothing remembered yet. Try &ldquo;Remember that I&apos;m vegetarian&rdquo; or &ldquo;Remember my budget is
              $400/month&rdquo;.
            </p>
          ) : (
            <ul className="memory-list">
              {memory.map((f) => (
                <li className="memory-chip animate-pop" key={f.id}>
                  <Sparkles size={12} />
                  <span>{f.text}</span>
                  <button
                    className="memory-x"
                    title="Forget this"
                    onClick={() => onMemoryChange(memory.filter((m) => m.id !== f.id))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="chat-scroll" ref={scrollRef}>
        {messages.map((m) => (
          <div className={`msg ${m.role} animate-msg`} key={m.id}>
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
                        <tr key={ri} className="animate-row" style={{ animationDelay: `${Math.min(ri, 12) * 30}ms` }}>
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
          <div className="msg assistant animate-msg">
            <div className="msg-avatar">
              <Bot size={16} />
            </div>
            <div className="msg-bubble">
              <span className="typing">
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="suggestions">
        {suggestions.map((s, i) => (
          <button
            className="suggestion animate-pop"
            style={{ animationDelay: `${i * 35}ms` }}
            key={s}
            onClick={() => send(s)}
            disabled={busy}
          >
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
