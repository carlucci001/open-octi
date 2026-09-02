import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('vitest sanity', () => {
  it('runs basic assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('renders a React component into jsdom', () => {
    render(<button type="button">Click me</button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });
});
