import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { Calendar } from './calendar';

let tree: ReactTestRenderer | undefined;
const text = (node: ReactTestInstance): string =>
  node.children.map(child => typeof child === 'string' ? child : text(child)).join('');

beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

it('shows the month, weekdays and navigation in Russian with the week starting on Monday', () => {
  act(() => { tree = create(<Calendar mode="single" month={new Date(2026, 10, 1)} />); });
  const root = tree!.root;
  expect(JSON.stringify(tree!.toJSON())).toContain('ноябрь 2026');
  const weekdays = root.findAll(node => node.type === 'th').map(text);
  expect(weekdays.slice(0, 7)).toEqual(['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']);
  const navLabels = root.findAll(node => node.type === 'button' && typeof node.props['aria-label'] === 'string')
    .map(node => node.props['aria-label'] as string);
  expect(navLabels).toContain('Перейти к следующему месяцу');
  expect(navLabels).toContain('Перейти к предыдущему месяцу');
});
