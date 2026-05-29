"use client";

import { useState } from "react";

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs px-3 py-1 rounded-full border transition-all"
      style={{
        borderColor: copied ? "#06C755" : "#ccc",
        color: copied ? "#06C755" : "#666",
        backgroundColor: copied ? "#f0fdf4" : "transparent",
      }}
    >
      {copied ? "コピー済み ✓" : "コピー"}
    </button>
  );
}
