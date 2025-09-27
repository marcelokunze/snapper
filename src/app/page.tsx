"use client";

import React, { useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import Terminal, { TerminalHandle } from "../components/Terminal";

type SimResult = {
  baseline: { out: string; feeBps: number };
  hook: { out: string; feeBps: number };
  impactBps: number;
};

type BuildTxResult = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
  gas?: string;
  summary?: any;
};

export default function Home() {
  const chainId = useChainId();
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const termRef = useRef<TerminalHandle | null>(null);

  const [sim, setSim] = useState<SimResult | null>(null);
  const [buildTx, setBuildTx] = useState<BuildTxResult | null>(null);
  const [showTxModal, setShowTxModal] = useState(false);

  // Removed MCPay demo UI

  const networkBadge = useMemo(() => {
    return `Chain ${chainId}`;
  }, [chainId]);

  async function onSimulateSwap() {
    const res = await fetch("http://localhost:4000/mcp/simulateSwap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountIn: "100000000000000000", tokenIn: "TOKEN0", tokenOut: "TOKEN1", slippageBps: 50 }),
    });
    const data = (await res.json()) as SimResult;
    setSim(data);
    termRef.current?.push("Simulated swap via MCP", "🧪");
  }

  async function onBuildTx() {
    const res = await fetch("http://localhost:4000/mcp/buildTx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountIn: "100000000000000000", tokenIn: "TOKEN0", tokenOut: "TOKEN1", minOut: undefined, deadline: undefined, recipient: address }),
    });
    const data = (await res.json()) as BuildTxResult;
    setBuildTx(data);
    setShowTxModal(true);
  }

  async function onSendTx() {
    if (!walletClient || !buildTx) return;
    try {
      const hash = await walletClient.sendTransaction({
        to: buildTx.to,
        data: buildTx.data,
        value: 0n,
      });
      termRef.current?.push(`Sent tx ${hash}`, "📤");
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      termRef.current?.push(`Mined in block ${receipt.blockNumber}`, "⛏️");
      setShowTxModal(false);
    } catch (err: any) {
      termRef.current?.push(`Tx error: ${err?.message || String(err)}`, "⚠️");
    }
  }

  // MCPay demo handlers removed

  async function onUpdatePolicy() {
    const res = await fetch("http://localhost:4000/mcp/updatePolicy", { method: "POST" });
    const data = await res.json();
    termRef.current?.push(`Policy update tx: ${JSON.stringify(data)}`, "🛠️");
  }

  return (
    <div className="min-h-screen w-full px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ConnectButton />
          <span className="text-xs px-2 py-1 rounded bg-neutral-800 text-neutral-200">{networkBadge}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onSimulateSwap}
            className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
          >
            Simulate Swap
          </button>
          <button
            onClick={onBuildTx}
            className="px-3 py-2 rounded bg-indigo-600 text-white text-sm"
          >
            Build Tx
          </button>
          {/* MCPay button removed */}
          <button
            onClick={onUpdatePolicy}
            className="px-3 py-2 rounded bg-amber-600 text-white text-sm"
          >
            Update Policy (Agent)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="border border-neutral-800 rounded p-4">
          <div className="font-semibold mb-2">Simulate Result</div>
          <pre className="text-xs whitespace-pre-wrap">{sim ? JSON.stringify(sim, null, 2) : "No simulation yet"}</pre>
        </div>
        {/* MCPay panel removed */}
      </div>

      {showTxModal && buildTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
          <div className="bg-neutral-900 text-neutral-100 rounded p-4 w-[520px] max-w-[90vw]">
            <div className="font-semibold mb-2">Tx Preview</div>
            <pre className="text-xs whitespace-pre-wrap mb-3">{JSON.stringify(buildTx.summary ?? buildTx, null, 2)}</pre>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTxModal(false)} className="px-3 py-2 rounded bg-neutral-700 text-white text-sm">Cancel</button>
              <button onClick={onSendTx} className="px-3 py-2 rounded bg-blue-600 text-white text-sm">Send</button>
            </div>
          </div>
        </div>
      )}

      {/* MCPay modal removed */}

      <div className="mt-6">
        <Terminal ref={termRef} />
      </div>
    </div>
  );
}
