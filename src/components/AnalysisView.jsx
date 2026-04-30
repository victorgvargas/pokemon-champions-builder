import React from "react";
import { AlertTriangle, RefreshCw, Sparkles, Shield, Swords, Zap, Activity, Users, Trophy, Download, FileText } from "lucide-react";

function exportAnalysis(analysis, team, format, kind) {
  const filled = team.filter((s) => s.pokemon).map((s) => ({
    name: s.pokemon.name,
    types: s.pokemon.types,
    ability: s.ability,
    item: s.item,
    moves: s.moves.filter(Boolean),
    nature: s.nature,
    sp: s.sp,
  }));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  let blob, filename;
  if (kind === "json") {
    const payload = {
      exported_at: new Date().toISOString(),
      format,
      team: filled,
      analysis,
    };
    blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    filename = `champions-analysis-${stamp}.json`;
  } else {
    blob = new Blob([toMarkdown(analysis, filled, format)], { type: "text/markdown" });
    filename = `champions-analysis-${stamp}.md`;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toMarkdown(a, team, format) {
  const bullets = (arr) => (arr || []).map((x) => `- ${x}`).join("\n");
  const teamBlock = team.map((m, i) => {
    const moves = m.moves.length ? m.moves.join(" / ") : "—";
    return `### Slot ${i + 1}: ${m.name}\n- Types: ${m.types?.join(", ") || "—"}\n- Ability: ${m.ability || "—"}\n- Item: ${m.item || "—"}\n- Nature: ${m.nature}\n- Moves: ${moves}\n- SP: HP ${m.sp.hp} / Atk ${m.sp.atk} / Def ${m.sp.def} / SpA ${m.sp.spa} / SpD ${m.sp.spd} / Spe ${m.sp.spe}`;
  }).join("\n\n");

  return `# Team Analysis

**Format:** ${format} (Reg M-A)
**Overall Grade:** ${a.overall_grade}
**Archetype:** ${a.archetype}
**Exported:** ${new Date().toISOString()}

## Team

${teamBlock}

## Strengths
${bullets(a.strengths)}

## Weaknesses
${bullets(a.weaknesses)}

## Speed Control
${a.speed_control}

## Fake Out Users
${a.fake_out_users}

## Redirection
${a.redirection}

## Type Coverage
${a.type_coverage}

## Key Meta Threats
${bullets(a.key_threats)}

## Suggestions
${bullets(a.suggestions)}
`;
}

export default function AnalysisView({
  analysis, analyzing, analysisError, runAIAnalysis, team, format, setView,
}) {
  const teamSize = team.filter((s) => s.pokemon).length;

  if (analyzing) {
    return (
      <div className="panel p-12 rounded-sm text-center">
        <div className="display-font text-3xl text-rose-500 glow-text mb-4 animate-pulse">ANALYZING...</div>
        <div className="text-xs text-stone-500 tracking-widest">CONSULTING THE META ORACLE</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="panel p-8 rounded-sm">
        <div className="display-font text-2xl tracking-wider mb-2">AI TEAM ANALYSIS</div>
        <div className="text-xs text-stone-500 tracking-wider mb-6">
          Gemini 2.5 Flash breaks down your team's archetype, strengths, weaknesses, speed control, and threats. Falls back to a local rule-based analyzer if the API is unavailable.
        </div>
        {analysisError && (
          <div className="panel p-3 text-xs text-rose-400 flex items-center gap-2 panel-accent mb-4">
            <AlertTriangle size={14} /> {analysisError}
          </div>
        )}
        <button
          onClick={runAIAnalysis}
          disabled={teamSize === 0}
          className="btn-primary px-6 py-3 text-sm rounded-sm flex items-center gap-2"
        >
          <Sparkles size={16} />
          {teamSize === 0 ? "ADD POKÉMON FIRST" : "RUN AI ANALYSIS"}
        </button>
      </div>
    );
  }

  const gradeColors = { A: "#10b981", B: "#84cc16", C: "#eab308", D: "#f97316", F: "#ef4444" };
  const grade = analysis.overall_grade?.[0]?.toUpperCase() || "C";

  return (
    <div className="space-y-4">
      <div className="panel p-6 rounded-sm flex items-center gap-6">
        <div
          className="w-24 h-24 flex items-center justify-center display-font text-6xl font-bold border-2"
          style={{ borderColor: gradeColors[grade], color: gradeColors[grade] }}
        >
          {grade}
        </div>
        <div className="flex-1">
          <div className="text-[10px] tracking-widest text-stone-500 uppercase">Overall Grade · {format} · Reg M-A</div>
          <div className="display-font text-3xl tracking-wider mt-1">{analysis.archetype}</div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button
              onClick={runAIAnalysis}
              className="text-[10px] tracking-widest text-rose-400 hover:text-rose-300 uppercase flex items-center gap-1"
            >
              <RefreshCw size={10} /> Re-analyze
            </button>
            <button
              onClick={() => exportAnalysis(analysis, team, format, "md")}
              className="text-[10px] tracking-widest text-stone-400 hover:text-white uppercase flex items-center gap-1"
              title="Download as Markdown"
            >
              <FileText size={10} /> Export .md
            </button>
            <button
              onClick={() => exportAnalysis(analysis, team, format, "json")}
              className="text-[10px] tracking-widest text-stone-400 hover:text-white uppercase flex items-center gap-1"
              title="Download as JSON"
            >
              <Download size={10} /> Export .json
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section title="Strengths" items={analysis.strengths} icon={<Trophy size={14} />} accent="#10b981" />
        <Section title="Weaknesses" items={analysis.weaknesses} icon={<AlertTriangle size={14} />} accent="#ef4444" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Prose title="Speed Control" body={analysis.speed_control} icon={<Zap size={14} />} />
        <Prose title="Fake Out Users" body={analysis.fake_out_users} icon={<Activity size={14} />} />
        <Prose title="Redirection" body={analysis.redirection} icon={<Users size={14} />} />
        <Prose title="Type Coverage" body={analysis.type_coverage} icon={<Shield size={14} />} />
      </div>

      <Section title="Key Meta Threats" items={analysis.key_threats} icon={<Swords size={14} />} accent="#f97316" />
      <Section title="Suggestions" items={analysis.suggestions} icon={<Sparkles size={14} />} accent="#ff3860" />

      <button
        onClick={() => setView("builder")}
        className="text-xs tracking-widest text-stone-400 hover:text-white uppercase flex items-center gap-1"
      >
        ← Back to builder
      </button>
    </div>
  );
}

function Section({ title, items, icon, accent }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="panel p-4 rounded-sm" style={{ "--accent": accent }}>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: accent }}>{icon}</span>
        <div className="display-font text-lg tracking-wider">{title}</div>
      </div>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-stone-200 flex gap-2">
            <span style={{ color: accent }} className="shrink-0">▸</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Prose({ title, body, icon }) {
  if (!body) return null;
  return (
    <div className="panel p-4 rounded-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-stone-400">{icon}</span>
        <div className="text-[10px] tracking-widest text-stone-500 uppercase">{title}</div>
      </div>
      <div className="text-sm text-stone-200">{body}</div>
    </div>
  );
}
