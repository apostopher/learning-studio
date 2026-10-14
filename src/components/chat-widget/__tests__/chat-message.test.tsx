// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatMessage } from '#/components/chat-widget/chat-message';

const render = (text: string, role: 'assistant' | 'user' = 'assistant') =>
  renderToStaticMarkup(<ChatMessage text={text} role={role} />);

describe('ChatMessage — math', () => {
  it('typesets an inline formula instead of showing its LaTeX source', () => {
    const html = render(
      'Kinetic energy ($\\frac{1}{2} \\text{mass} \\times \\text{velocity}^2$) matters.',
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="mfrac"');
    expect(html).not.toContain('$\\frac');
  });

  it('typesets a $$ display formula as a block', () => {
    const html = render('$$\nKE = \\tfrac{1}{2}mv^2\n$$');
    expect(html).toContain('class="katex-display"');
  });

  it('shows an unclosed formula (still streaming) as plain text', () => {
    const html = render('Kinetic energy ($\\frac{1}{2');
    expect(html).not.toContain('class="katex"');
    expect(html).toContain('$\\frac{1}{2');
  });

  it('renders a formula KaTeX cannot parse as its source, without throwing', () => {
    const html = render('$\\notacommand{x}$');
    expect(html).toContain('notacommand');
    expect(html).not.toContain('#cc0000');
  });

  it('leaves learner messages as plain text', () => {
    const html = render('what is $\\frac{1}{2}$?', 'user');
    expect(html).not.toContain('katex');
    expect(html).toContain('$\\frac{1}{2}$');
  });
});
