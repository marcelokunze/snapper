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
    termRef.current?.pushResult(JSON.stringify(data, null, 2), "🧪");
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
    const preview = data.summary ?? data;
    termRef.current?.push("Built swap tx", "🧰");
    termRef.current?.pushResult(JSON.stringify(preview, null, 2), "🧰");
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

  async function onApproveToken0() {
    if (!walletClient || !address) {
      termRef.current?.push("Connect a wallet first", "⚠️");
      return;
    }
    try {
      const res = await fetch("http://localhost:4000/mcp/addresses");
      const addrs = await res.json();
      const token0 = addrs.token0 as `0x${string}`;
      const spender = addrs.swapper as `0x${string}`;
      const ERC20Abi = [
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ] as const;

      const hash = await walletClient.writeContract({
        address: token0,
        abi: ERC20Abi,
        functionName: "approve",
        args: [spender, (BigInt(1) << BigInt(256)) - BigInt(1)],
        account: address,
      });
      termRef.current?.push(`Approve tx ${hash}`, "✅");
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      termRef.current?.push(`Approve mined in block ${receipt.blockNumber}`, "⛏️");
    } catch (err: any) {
      termRef.current?.push(`Approve error: ${err?.message || String(err)}`, "⚠️");
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
            onClick={onApproveToken0}
            className="px-3 py-2 rounded bg-emerald-600 text-white text-sm"
          >
            Approve TOKEN0
          </button>
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

      {/* Removed Simulate Result panel; results now appear in the terminal */}

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

      <div className="fixed left-0 right-0 bottom-0 px-6 pb-6">
        <Terminal ref={termRef} height="70vh" />
      </div>
    </div>
  );
}
