import React from "react";
import { Shield } from "lucide-react";
import { TYPES, TYPE_COLORS } from "../lib/types.js";

export default function TypeCoveragePanel({ typeAnalysis }) {
  return (
    <div className="panel p-4 rounded-sm">
      <div className="flex items-center gap-2 mb-3">
        <Shield size={14} className="text-rose-500" />
        <div className="display-font text-lg tracking-wider">DEFENSIVE COVERAGE</div>
      </div>
      <div className="text-[10px] tracking-widest text-stone-500 uppercase mb-3">
        Per-type team breakdown · ⚠ flagged on uncoverable holes (4+ weak, or 3+ weak with ≤1 resist, or 2+ weak with 0 resists)
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
        {TYPES.map((t) => {
          const c = typeAnalysis[t];
          const resists = c.resist + c.immune;
          const flagged = c.weak >= 4 || (c.weak >= 3 && resists < 2) || (c.weak >= 2 && resists === 0);
          return (
            <div
              key={t}
              className={`p-2 border ${flagged ? "border-rose-500/60 bg-rose-500/10" : "border-white/5"}`}
              style={{ borderLeftColor: TYPE_COLORS[t], borderLeftWidth: 3 }}
            >
              <div className="text-[10px] font-bold uppercase">{t}</div>
              <div className="flex gap-2 text-[10px] mt-1">
                <span className="text-rose-400">×{c.weak}</span>
                <span className="text-emerald-400">+{c.resist + c.immune}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
