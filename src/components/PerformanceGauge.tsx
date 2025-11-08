import { useEffect, useRef } from 'react';
import { ArcElement, Chart, DoughnutController, Tooltip } from 'chart.js';
import { ArrowUpRight, CircleCheck, Info } from 'lucide-react';
Chart.register(ArcElement, DoughnutController, Tooltip);

export function PerformanceGauge({ score, onOpen }: { score: number; onOpen: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart<'doughnut'>>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    chart.current = new Chart(canvas.current, {
      type: 'doughnut',
      data: { labels: ['Optimization score', 'Remaining'], datasets: [{ data: [score, 100 - score], backgroundColor: ['#10b981', '#23313c'], borderWidth: 0, borderRadius: 5, hoverOffset: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '87%', radius: '96%', rotation: -130, circumference: 260,
        animation: { duration: reduced ? 0 : 1100, easing: 'easeOutQuart' },
        events: [], plugins: { tooltip: { enabled: false }, legend: { display: false } }, layout: { padding: 4 },
      },
    });
    return () => { chart.current?.destroy(); chart.current = null; };
  }, []);
  useEffect(() => {
    if (!chart.current) return;
    chart.current.data.datasets[0].data = [score, 100 - score];
    chart.current.data.datasets[0].backgroundColor = [score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#fb7185', '#23313c'];
    chart.current.update();
  }, [score]);
  return <section className="panel performance-card">
    <div className="performance-heading"><h3>Optimization score</h3><span title="A heuristic score based on indexing, selected columns, joins, and result limits. Not a production benchmark." tabIndex={0}><Info size={14} /></span></div>
    <div className="gauge-wrap" role="img" aria-label={`Optimization score: ${score} out of 100`}>
      <canvas ref={canvas} aria-hidden="true" />
      <div className="gauge-value"><strong>{score}</strong><span>out of 100</span></div>
      <span className="gauge-min">0</span><span className="gauge-max">100</span>
    </div>
    <div className={`gauge-status ${score < 75 ? 'gauge-warning' : ''}`}><CircleCheck size={13} />{score >= 90 ? 'Excellent performance' : score >= 75 ? 'Looking good' : 'Room to improve'}</div>
    <button className="performance-link" onClick={onOpen}>{score >= 90 ? 'View your optimizations' : 'A little tuning goes a long way'}<ArrowUpRight size={14} /></button>
  </section>;
}
