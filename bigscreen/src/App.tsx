import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import type { ECharts } from "echarts";
import "./App.css";
import type { GraphEdge, GraphNode, LogItem, LogKind, Phase, Step } from "./types";

const STAGES = ["Supervisor", "Extractor", "Validator", "HITL", "Analyst"] as const;
const CATS = [
  { name: "公司", color: "#00e5ff" },
  { name: "人物", color: "#b388ff" },
  { name: "金融机构", color: "#ffd740" },
  { name: "合同", color: "#69f0ae" },
];

// ---- 假数据：阶段 2 起由后端 SSE 事件替代 ----
const ALL_NODES: GraphNode[] = [
  { id: "A集团", cat: 0, size: 48 },
  { id: "B科技", cat: 0, size: 36 },
  { id: "C供应链", cat: 0, size: 30 },
  { id: "张三", cat: 1, size: 28 },
  { id: "D银行", cat: 2, size: 32 },
  { id: "采购合同#17", cat: 3, size: 24 },
];
const ALL_EDGES: GraphEdge[] = [
  { id: "e1", source: "A集团", target: "B科技", label: "控股" },
  { id: "e2", source: "B科技", target: "A集团", label: "控股", conflict: true },
  { id: "e3", source: "张三", target: "A集团", label: "实控人" },
  { id: "e4", source: "A集团", target: "D银行", label: "贷款" },
  { id: "e5", source: "B科技", target: "C供应链", label: "签约" },
  { id: "e6", source: "C供应链", target: "采购合同#17", label: "履行" },
];
const STEPS: Step[] = [
  { stage: 0, log: "收到文档《A集团2025年报》，开始调度" },
  { stage: 1, log: "Extractor 抽取到 4 个实体、3 条关系", nodes: 4, edges: 3 },
  { stage: 1, log: "Extractor 抽取到 2 个实体、3 条关系", nodes: 6, edges: 6 },
  { stage: 2, log: "Validator 发现冲突：A集团与B科技互相控股，缺少证据", nodes: 6, edges: 6, flag: true },
  { stage: 3, log: "进入人工审核，流程暂停（interrupt）", wait: true },
  { stage: 3, log: "收到人工修改，恢复执行（resume）" },
  { stage: 4, log: "Analyst 生成风险报告", report: true },
];
const REPORT = `## 风险分析报告

核心主体：A集团（控股 B科技，贷款方 D银行）

### 关键发现
- 实控人张三通过 A集团 间接控制 B科技、C供应链
- 采购合同#17 构成关联交易链路
- 人工已剔除 1 条循环控股（幻觉）

### 建议
重点核查 B科技 与 C供应链 的交易定价。`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export default function App() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [stage, setStage] = useState(-1);
  const [phase, setPhase] = useState<Phase>("idle");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [report, setReport] = useState("");
  const chartEl = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const addLog = (text: string, kind: LogKind = "agent") =>
    setLogs((l) => [...l, { text, kind, t: new Date().toLocaleTimeString() }]);

  useEffect(() => {
    const c = echarts.init(chartEl.current!);
    chart.current = c;
    c.on("click", (p) => {
      if (p.dataType === "edge" && phaseRef.current === "waiting") {
        const d = p.data as { id: string; source: string; target: string; name: string };
        setEdges((es) => es.filter((e) => e.id !== d.id));
        addLog(`人工删除关系：${d.source} -${d.name}-> ${d.target}`, "human");
      }
    });
    const onResize = () => c.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      c.dispose();
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption({
      backgroundColor: "transparent",
      legend: { data: CATS.map((c) => c.name), textStyle: { color: "#8fa3bf" }, top: 8 },
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          draggable: true,
          categories: CATS.map((c) => ({ name: c.name, itemStyle: { color: c.color } })),
          force: { repulsion: 420, edgeLength: 130, gravity: 0.08 },
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: 8,
          label: { show: true, color: "#e6f1ff", position: "bottom" },
          data: nodes.map((n) => ({
            id: n.id,
            name: n.id,
            category: n.cat,
            symbolSize: n.size,
            itemStyle: { shadowBlur: 18, shadowColor: CATS[n.cat].color },
          })),
          links: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            name: e.label,
            label: { show: true, formatter: e.label, color: e.flagged ? "#ff2e63" : "#8fa3bf" },
            lineStyle: {
              color: e.flagged ? "#ff2e63" : "#2a6f97",
              width: e.flagged ? 3 : 1.5,
              type: e.flagged ? "dashed" : "solid",
              curveness: 0.2,
            },
          })),
        },
      ],
    });
  }, [nodes, edges]);

  async function run() {
    setLogs([]);
    setNodes([]);
    setEdges([]);
    setReport("");
    setPhase("running");
    for (const s of STEPS) {
      setStage(s.stage);
      addLog(s.log, s.wait ? "wait" : s.flag ? "warn" : "agent");
      if (s.nodes !== undefined && s.edges !== undefined) {
        setNodes(ALL_NODES.slice(0, s.nodes));
        setEdges(ALL_EDGES.slice(0, s.edges).map((e) => ({ ...e, flagged: !!(s.flag && e.conflict) })));
      }
      if (s.wait) {
        setPhase("waiting");
        // 模拟 interrupt：等人点按钮（阶段 4 换成调后端 resume 接口）
        await new Promise<void>((res) => (resumeRef.current = res));
        setPhase("running");
      }
      if (s.report) {
        for (let i = 1; i <= REPORT.length; i++) {
          setReport(REPORT.slice(0, i));
          await sleep(18);
        }
      }
      await sleep(900);
    }
    setPhase("done");
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          DOCGRAPH <b>SENTINEL</b>
        </div>
        <div className="stages">
          {STAGES.map((s, i) => (
            <span key={s} className={"stage" + (i === stage ? " on" : "") + (s === "HITL" ? " hitl" : "")}>
              {s}
            </span>
          ))}
        </div>
        <button onClick={run} disabled={phase === "running" || phase === "waiting"}>
          {phase === "idle" ? "启动分析" : phase === "done" ? "重新运行" : "运行中…"}
        </button>
      </header>

      <aside className="panel">
        <h3>AGENT 日志</h3>
        <div className="logs">
          {logs.map((l, i) => (
            <div key={i} className={"log " + l.kind}>
              <span>{l.t}</span>
              {l.text}
            </div>
          ))}
        </div>
      </aside>

      <main className="panel center">
        <div ref={chartEl} className="chart" />
        {phase === "waiting" && (
          <div className="hitl-bar">
            <span>人工审核：点击图中的边可删除，然后提交</span>
            <button onClick={() => resumeRef.current?.()}>确认并继续</button>
          </div>
        )}
      </main>

      <aside className="panel">
        <h3>分析报告</h3>
        <pre className="report">{report || "等待 Analyst…"}</pre>
      </aside>
    </div>
  );
}