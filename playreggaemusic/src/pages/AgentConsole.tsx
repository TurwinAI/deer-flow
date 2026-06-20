/**
 * Owner-only agent console (B07).
 *
 * Lets the operator trigger an autonomous run and read the transcript. In
 * fixtures mode `runAgent` returns a CANNED transcript (no live LLM); in prod it
 * calls the admin-guarded `runAgent` callable, which assembles the lead agent
 * with a Claude model that only reaches the network once the operator supplies
 * ANTHROPIC_API_KEY at handoff.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { runAgent, type TranscriptEntry } from "../lib/admin";
import { watchAdminSession, type AdminSession } from "../lib/auth";

const DEFAULT_PROMPT = "Plan the next Roots Untold release and put it on sale.";

export default function AgentConsole() {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => watchAdminSession(setSession), []);

  async function trigger(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const result = await runAgent(prompt);
      setTranscript(result);
    } catch {
      setError("The agent run failed. Check credentials and try again.");
    } finally {
      setRunning(false);
    }
  }

  if (session === undefined) return <p>Checking access…</p>;
  if (!session || !session.isAdmin) {
    return (
      <section aria-labelledby="agent-denied">
        <h1 id="agent-denied">Admin sign-in required</h1>
        <p>The agent console is owner-only.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="agent-heading">
      <h1 id="agent-heading">Agent console</h1>
      <p>
        Trigger an autonomous run and review the transcript.{" "}
        <Link to="/admin">← Back to admin</Link>
      </p>

      <form onSubmit={trigger} aria-label="Trigger agent run">
        <label>
          Instruction
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            name="agent-prompt"
            rows={3}
          />
        </label>
        <button type="submit" disabled={running}>
          {running ? "Running…" : "Trigger run"}
        </button>
      </form>

      {error && <p role="alert">{error}</p>}

      {transcript && (
        <section aria-labelledby="transcript-heading" className="transcript">
          <h2 id="transcript-heading">Transcript</h2>
          <ol>
            {transcript.map((entry, i) => (
              <li key={i} data-role={entry.role}>
                <span className="transcript-role">{entry.role}</span>
                <span className="transcript-content">{entry.content}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
