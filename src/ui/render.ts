import { GRID_CELLS, type Finding } from '../types';
import type { Report } from '../report/report';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string } = {},
  children: Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  children.forEach((c) => node.append(c));
  return node;
}

export function buildGrid(grid: HTMLElement): void {
  grid.replaceChildren(...GRID_CELLS.map((name) => {
    const cell = el('div', { className: 'cell' });
    cell.dataset.cell = name;
    return cell;
  }));
}

export function litCells(grid: HTMLElement, findings: Finding[]): void {
  grid.querySelectorAll<HTMLElement>('.cell').forEach((c) => c.classList.remove('hit', 'low'));
  for (const f of findings) {
    const cell = grid.querySelector<HTMLElement>(`[data-cell="${f.cell}"]`);
    if (!cell) continue;
    cell.classList.add('hit');
    if (f.confidence === 'low') cell.classList.add('low');
  }
}

export function renderReport(body: HTMLElement, report: Report): void {
  const nodes: Node[] = [];
  if (report.items.length > 0) {
    nodes.push(el('ul', { className: 'found' }, report.items.map((i) => el('li', { text: i.sentence }))));
  }
  if (report.advice.length > 0) {
    nodes.push(el('ul', { className: 'advice' }, report.advice.map((a) => el('li', { text: a }))));
  }
  nodes.push(el('p', { className: 'engine-line', text: report.engineLine }));
  nodes.push(el('p', { className: 'note', text: report.note }));
  body.replaceChildren(...nodes);
}

export function actionButton(label: string, hint: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { className: 'btn' }, [el('span', { text: label }), el('small', { text: hint })]);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}
