"use client";

import { useState,useRef, useEffect } from "react";
import { signOut } from "next-auth/react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
};

    useEffect(() => {
    scrollToBottom();
    }, [messages]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    
    const updatedMessages: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Failed to get response");
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
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      {/* <header className="py-4 border-b">
        <h1 className="text-xl font-bold">Protected Free-LLM Chat</h1>
      </header> */}
      <header className="py-4 border-b flex justify-between items-center">
        <h1 className="text-xl font-bold">Protected Free-LLM Chat</h1>
        <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm bg-gray-200 hover:bg-gray-300 dark:bg-zinc-800 dark:hover:bg-zinc-700 px-3 py-1 rounded-md transition"
        >
            Sign Out
        </button>
        </header>

      <div className="flex-1 overflow-y-auto space-y-4 py-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg ${
              m.role === "user"
                ? "bg-blue-600 text-white ml-auto max-w-[80%]"
                : "bg-gray-100 text-gray-900 mr-auto max-w-[80%]"
            }`}
          >
            <p className="font-semibold text-xs mb-1">
              {m.role === "user" ? "You" : "AI"}
            </p>
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 pt-2 border-t">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-2 border rounded-md text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="bg-black text-white px-4 py-2 rounded-md hover:bg-zinc-800 disabled:opacity-50"
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
        <button
            onClick={() => setMessages([])}
            className="text-xs text-gray-500 hover:text-red-500 underline"
            >
            Clear Chat
        </button>
      </form>
    </div>
  );
}