"use client";

import { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setError(null);

    const updatedMessages: Message[] = [
      ...messages,
      { role: "user", content: userMsg },
    ];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (response.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Too many messages. Limit is 10 per minute. Please wait a moment and try again.",
          },
        ]);
        return;
      }

      if (!response.ok) {
        let errorMessage =
          "An error occurred while generating a response. Please try again.";
        try {
          const data = await response.json();
          if (data && typeof data.error === "string" && data.error.trim()) {
            errorMessage = data.error;
          }
        } catch {
          // Fallback to generic friendly message if JSON parsing fails
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: errorMessage },
        ]);
        return;
      }

      if (!response.body) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "An error occurred while generating a response. Please try again.",
          },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const lastIndex = prev.length - 1;
          const updated = [...prev];
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: updated[lastIndex].content + textChunk,
          };
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "An error occurred while generating a response. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] w-full max-w-3xl mx-auto bg-zinc-50 border-x border-zinc-200/60 shadow-sm overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-white/80 backdrop-blur-md border-b border-zinc-200 px-4 py-3 sm:px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-zinc-900 text-white font-bold text-base shadow-sm">
            D
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 leading-tight">
              Donna
            </h1>
            <p className="text-xs text-zinc-500 font-medium">
              AI Portfolio Assistant
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setError(null);
              }}
              className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 font-semibold text-xl">
              D
            </div>
            <div className="space-y-1 max-w-sm">
              <h2 className="text-lg font-semibold text-zinc-800">
                Hi, I'm Donna! An AI Portfolio Assistant
              </h2>
              <p className="text-sm text-zinc-500">
                Ask Donna about Abhishek's portfolio, projects, skills, or any other relevant information.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isLastAssistant =
              m.role === "assistant" && idx === messages.length - 1;
            const isWaitingForFirstToken =
              isLastAssistant && m.content === "" && isLoading;

            return (
              <div
                key={idx}
                className={`flex flex-col ${
                  m.role === "user" ? "items-end" : "items-start"
                }`}
              >
                <div
                  className={`px-4 py-3 rounded-2xl max-w-[85%] sm:max-w-[75%] text-sm sm:text-base leading-relaxed shadow-xs ${
                    m.role === "user"
                      ? "bg-zinc-900 text-white rounded-br-xs"
                      : "bg-white text-zinc-900 border border-zinc-200/80 rounded-bl-xs"
                  }`}
                >
                  {isWaitingForFirstToken ? (
                    <div className="flex items-center gap-1.5 py-1 px-1">
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce"></span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                </div>
              </div>
            );
          })
        )}

        {error && (
          <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl font-medium">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Input Footer */}
      <footer className="shrink-0 bg-white border-t border-zinc-200 p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 h-11 px-4 bg-zinc-50 text-zinc-900 border border-zinc-300 rounded-xl placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white text-base sm:text-sm transition-colors"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-11 px-5 bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center justify-center"
          >
            {isLoading ? "Sending..." : "Send"}
          </button>
        </form>
      </footer>
    </div>
  );
}
